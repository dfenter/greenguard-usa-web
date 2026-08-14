/* Terrace Tales - fleet F11 AAA rebuild.
 * Phaser 3 paints the view. GGKit owns lifecycle, input, saves, audio, PWA,
 * settings, orientation, and reduced-motion policy.
 */
(function (root) {
  'use strict';

  var PhaserRef = root.Phaser;
  var KitRef = root.GGKit;
  var W = 390, H = 844, COLS = 8, ROWS = 8;
  var CELL = 44, BOARD_X = 19, BOARD_Y = 232;
  var FONT = 'system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif';
  var STEP = 1 / 60;
  var TAU = Math.PI * 2;

  var PALETTE = [0xF25C68, 0xF7C948, 0x5BCB77, 0x38A8DE, 0x9A7CF3, 0xF29A4A];
  var CSS_PALETTE = ['#F25C68', '#F7C948', '#5BCB77', '#38A8DE', '#9A7CF3', '#F29A4A'];
  var INK = 0x182238, BOARD = 0x243453, CELL_A = 0x314567, CELL_B = 0x2C3F61;
  var PAPER = 0xFFF8EE, META_INK = 0x2B2D42, WOOD = 0xA86F4C, LEAF = 0x4F9D69;
  var SYMBOLS = ['seed', 'sun', 'leaf', 'drop', 'star', 'flame'];
  var SYMBOL_GLYPHS = ['●', '✦', '❧', '◆', '★', '♠'];
  var SPECIAL = { NONE: 0, ROW: 1, COL: 2, BOMB: 3, PRISM: 4 };
  var Game = { phaser: null, active: null };
  var kit = null;

  var ZONES = [
    { id: 'entry-terrace', name: 'Entry Terrace', short: 'Terracotta + stone steps', accent: 0xEC6B62, sky: 0xB9D9D2 },
    { id: 'courtyard', name: 'Courtyard', short: 'Water + warm gathering', accent: 0x5DB7D8, sky: 0xB7D9DB },
    { id: 'orchard', name: 'Orchard', short: 'Fruit trees + woven shade', accent: 0xF3BC50, sky: 0xC8DDAF },
    { id: 'hollowbrook-rise', name: 'Hollowbrook Rise', short: 'Lanterns + the final vista', accent: 0x9A7CF3, sky: 0xB7C7E6 }
  ];

  var SLOTS = [
    { zone: 0, name: 'Retaining edge', options: ['Drystone wall', 'Willow bank'], art: ['wall', 'willow'] },
    { zone: 0, name: 'Rain catch', options: ['Spill basin', 'Reed rill'], art: ['basin', 'rill'] },
    { zone: 0, name: 'Entry planting', options: ['Herb beds', 'Wildflower drift'], art: ['herbs', 'wildflowers'] },
    { zone: 0, name: 'Resting step', options: ['Stone bench', 'Timber deck'], art: ['bench', 'deck'] },
    { zone: 1, name: 'Orchard row', options: ['Pear espalier', 'Plum grove'], art: ['espalier', 'plum'] },
    { zone: 1, name: 'Courtyard path', options: ['Gravel walk', 'Steppingstones'], art: ['gravel', 'stones'] },
    { zone: 1, name: 'Garden shelter', options: ['Potting shed', 'Open arbour'], art: ['shed', 'arbour'] },
    { zone: 1, name: 'Evening light', options: ['Lantern posts', 'Fire bowl'], art: ['lanterns', 'fire'] },
    { zone: 2, name: 'Wind frames', options: ['Glass cloches', 'Reed screens'], art: ['cloches', 'screens'] },
    { zone: 2, name: 'High beds', options: ['Alpine rockery', 'Moss garden'], art: ['rockery', 'moss'] },
    { zone: 2, name: 'Cistern', options: ['Cistern pool', 'Mist channel'], art: ['pool', 'mist'] },
    { zone: 2, name: 'Orchard crown', options: ['Bell post', 'Sky trellis'], art: ['bell', 'trellis'] },
    { zone: 3, name: 'Rise stair', options: ['Switchback stair', 'Straight flight'], art: ['switchback', 'flight'] },
    { zone: 3, name: 'Threshold', options: ['Iron gate', 'Hedge arch'], art: ['gate', 'arch'] },
    { zone: 3, name: 'Finale vista', options: ['Beacon lantern', 'Star pond'], art: ['beacon', 'pond'] }
  ];

  function level(seed, zone, title, moves, colors, goals, bonusMoves, freeBombs, ramp) {
    return { seed: seed, zone: zone, title: title, moves: moves, colors: colors, goals: goals,
      bonusMoves: bonusMoves || 0, freeBombs: freeBombs || 0, ramp: ramp || 'steady' };
  }
  var LEVELS = [
    level(10731, 0, 'Make the approach green', 25, 5, [{ color: 2, need: 16 }], 4, 0, 'learn'),
    level(20913, 0, 'Lead the rain downhill', 24, 5, [{ color: 3, need: 18 }], 4, 0, 'learn'),
    level(31577, 0, 'Wake the bare soil', 24, 5, [{ color: 2, need: 14 }, { color: 0, need: 12 }], 3, 0, 'ramp'),
    level(44201, 0, 'Leave room to sit', 23, 5, [{ color: 4, need: 18 }], 4, 0, 'ramp'),
    level(51863, 1, 'Bring back the fruit row', 23, 5, [{ color: 1, need: 15 }, { color: 3, need: 14 }], 4, 1, 'courtyard'),
    level(60449, 1, 'Give feet a clear path', 22, 6, [{ color: 0, need: 18 }], 5, 1, 'courtyard'),
    level(71225, 1, 'A roof for the gardener', 22, 6, [{ color: 5, need: 15 }, { color: 2, need: 14 }], 4, 1, 'ramp'),
    level(80987, 1, 'Hold the last light', 21, 6, [{ color: 4, need: 20 }], 5, 1, 'ramp'),
    level(91653, 2, 'Negotiate with the wind', 21, 6, [{ color: 3, need: 15 }, { color: 1, need: 14 }], 5, 1, 'orchard'),
    level(10241, 2, 'Plant the high beds', 20, 6, [{ color: 2, need: 16 }, { color: 0, need: 14 }], 5, 1, 'orchard'),
    level(11876, 2, 'Catch the whole hill', 20, 6, [{ color: 3, need: 15 }, { color: 5, need: 14 }], 5, 2, 'ramp'),
    level(12455, 2, 'Give the rise a signal', 19, 6, [{ color: 1, need: 21 }], 5, 2, 'ramp'),
    level(13699, 3, 'Climb without a chore', 19, 6, [{ color: 4, need: 16 }, { color: 2, need: 15 }], 6, 2, 'finale'),
    level(14822, 3, 'Set the threshold', 18, 6, [{ color: 5, need: 16 }, { color: 0, need: 15 }], 6, 2, 'finale'),
    level(15987, 3, 'Open the Hollowbrook view', 18, 6, [{ color: 4, need: 14 }, { color: 3, need: 14 }, { color: 1, need: 12 }], 7, 2, 'finale')
  ];

  var STORY_BEATS = [
    { character: 'Mara', role: 'the caretaker', sigil: 'M', title: 'A garden worth returning to', lines: ['Hollowbrook Rise is still here, under the brambles.', 'Clear the first terrace, and I will show you where the rain used to run.'], unlock: 'mara', motif: 'a sprouting seed' },
    { character: 'Mara', role: 'the caretaker', sigil: 'M', title: 'Follow the water', lines: ['The old channels were designed to carry water, not waste it.', 'Let the bright drops find their way downhill.'], unlock: 'mara', motif: 'a falling drop' },
    { character: 'Ivo', role: 'the seed keeper', sigil: 'I', title: 'Bare soil, patient hands', lines: ['I kept the seed jars through three dry summers.', 'Make room for green, and the hillside will answer.'], unlock: 'ivo', motif: 'two leaves' },
    { character: 'Ivo', role: 'the seed keeper', sigil: 'I', title: 'A place to pause', lines: ['A working garden needs a resting step.', 'Leave a little space for the people who tend it.'], unlock: 'ivo', motif: 'a small bench' },
    { character: 'Nell', role: 'the orchard keeper', sigil: 'N', title: 'Fruit returns first', lines: ['The orchard remembers every hand that cared for it.', 'Bring the water and sun back to the first row.'], unlock: 'nell', motif: 'a pear branch' },
    { character: 'Nell', role: 'the orchard keeper', sigil: 'N', title: 'A clear way through', lines: ['Paths are invitations, not instructions.', 'Give wet feet a dry line through the courtyard.'], unlock: 'nell', motif: 'a stepping stone' },
    { character: 'Mara', role: 'the caretaker', sigil: 'M', title: 'A roof for the work', lines: ['Every garden has weather to negotiate.', 'Build a little shelter before the next season turns.'], unlock: 'mara', motif: 'a roofline' },
    { character: 'Ivo', role: 'the seed keeper', sigil: 'I', title: 'Hold the last light', lines: ['At dusk, the rise becomes a different place.', 'Give the evening a warm point to gather around.'], unlock: 'ivo', motif: 'a lantern' },
    { character: 'Nell', role: 'the orchard keeper', sigil: 'N', title: 'Make friends with the wind', lines: ['The high beds need a little shelter, never a wall.', 'Let the wind pass through on kinder terms.'], unlock: 'nell', motif: 'a woven frame' },
    { character: 'Mara', role: 'the caretaker', sigil: 'M', title: 'Plant the high beds', lines: ['Up here, stone and moss share the same patience.', 'Choose what will hold the thin soil in place.'], unlock: 'mara', motif: 'a high bed' },
    { character: 'Ivo', role: 'the seed keeper', sigil: 'I', title: 'Catch the whole hill', lines: ['The rain belongs to every terrace.', 'A cistern can turn one storm into many mornings.'], unlock: 'ivo', motif: 'a rippling pool' },
    { character: 'Nell', role: 'the orchard keeper', sigil: 'N', title: 'Give the rise a signal', lines: ['People find their way by small, generous signs.', 'Set something bright above the orchard crown.'], unlock: 'nell', motif: 'a bell in the sky' },
    { character: 'Mara', role: 'the caretaker', sigil: 'M', title: 'Climb without a chore', lines: ['The last rise should feel like an invitation.', 'Give the path a rhythm that makes the climb lighter.'], unlock: 'mara', motif: 'a rising stair' },
    { character: 'Nell', role: 'the orchard keeper', sigil: 'N', title: 'Set the threshold', lines: ['A boundary can welcome as easily as it keeps out.', 'Make the entrance worthy of the view beyond it.'], unlock: 'nell', motif: 'an open arch' },
    { character: 'Mara', role: 'the caretaker', sigil: 'M', title: 'Open the Hollowbrook view', lines: ['We did not restore this place to keep it hidden.', 'One last clear, and the rise belongs to everyone again.'], unlock: 'mara', motif: 'a beacon over water' }
  ];

  var DEFAULT_SAVE = { version: 3, completed: 0, pendingChoice: -1, choices: [], story: [], characters: {}, best: {}, medals: {}, streaks: {}, hintFree: {} };
  for (var defaultI = 0; defaultI < 15; defaultI++) DEFAULT_SAVE.choices.push(-1);
  for (var defaultStoryI = 0; defaultStoryI < 15; defaultStoryI++) DEFAULT_SAVE.story.push(0);

  function objectLike(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function easeOut(t) { var u = 1 - t; return 1 - u * u * u; }
  function easeBack(t) { if (!motionOn()) return t; var c1 = 1.70158, c3 = c1 + 1, u = t - 1; return 1 + c3 * u * u * u + c1 * u * u; }
  function springProgress(t) { if (!motionOn()) return t; var u = clamp(t, 0, 1), value = 1 - Math.exp(-7 * u) * (Math.cos(10 * u) + .18 * Math.sin(10 * u)); return clamp(value, 0, 1.06); }
  function setTextIfChanged(obj, value) { var s = String(value); if (obj && obj.text !== s) obj.setText(s); return obj; }
  function setColorIfChanged(obj, color) { if (obj && obj.style && obj.style.color !== color) obj.setColor(color); }
  function validSave(o) {
    return objectLike(o) && o.version === 3 && Number.isFinite(o.completed) && Array.isArray(o.choices) &&
      objectLike(o.best) && objectLike(o.medals) && objectLike(o.streaks) &&
      (o.pendingChoice == null || Number.isFinite(o.pendingChoice));
  }
  function blankSave() {
    var d = { version: 3, completed: 0, pendingChoice: -1, choices: [], story: [], characters: {}, best: {}, medals: {}, streaks: {}, hintFree: {} };
    for (var i = 0; i < 15; i++) d.choices.push(-1);
    for (var storyI = 0; storyI < 15; storyI++) d.story.push(0);
    return d;
  }
  function sanitizeSave(o) {
    var d = blankSave();
    if (!validSave(o)) return d;
    for (var i = 0; i < 15; i++) d.choices[i] = o.choices[i] === 1 ? 1 : (o.choices[i] === 0 ? 0 : -1);
    var coherent = 0;
    while (coherent < 15 && d.choices[coherent] >= 0) coherent++;
    d.completed = Math.min(clamp(o.completed | 0, 0, 15), coherent);
    d.pendingChoice = o.pendingChoice == null ? -1 : clamp(o.pendingChoice | 0, -1, 14);
    if (d.completed >= 15) d.pendingChoice = -1;
    else if (d.pendingChoice !== d.completed) d.pendingChoice = -1;
    for (var choiceI = d.completed + (d.pendingChoice >= 0 ? 1 : 0); choiceI < 15; choiceI++) d.choices[choiceI] = -1;
    for (var storyI = 0; storyI < 15; storyI++) d.story[storyI] = Array.isArray(o.story) && o.story[storyI] === 1 ? 1 : 0;
    if (objectLike(o.characters)) Object.keys(o.characters).slice(0, 8).forEach(function (key) { if (o.characters[key] === true) d.characters[String(key).slice(0, 24)] = true; });
    ['best', 'medals', 'streaks', 'hintFree'].forEach(function (key) {
      if (!objectLike(o[key])) return;
      Object.keys(o[key]).slice(0, 15).forEach(function (k) {
        var n = Number(o[key][k]);
        if (Number.isFinite(n) && n >= 0) d[key][String(k).slice(0, 4)] = Math.min(9999999, n | 0);
      });
    });
    return d;
  }
  function levelIndex(v) {
    if (typeof v === 'string') {
      var raw = v.toLowerCase().replace('level-', '').replace('lvl-', '');
      if (/^\d+$/.test(raw)) v = Number(raw);
    }
    if (typeof v !== 'number' || !Number.isFinite(v)) return null;
    return clamp(Math.floor(v >= 1 ? v - 1 : v), 0, 14);
  }
  function slotIndex(v) {
    if (typeof v === 'string') {
      var raw = v.toLowerCase().replace('slot-', '').replace('reno-', '');
      if (/^\d+$/.test(raw)) v = Number(raw);
    }
    if (typeof v !== 'number' || !Number.isFinite(v)) return null;
    return clamp(Math.floor(v >= 1 ? v - 1 : v), 0, 14);
  }

  var oldProbe = objectLike(root.__tt) ? root.__tt : {};
  var oldState = objectLike(oldProbe.state) ? oldProbe.state : {};
  var DEBUG = {
    mode: oldState.mode || 'boot', level: oldState.level || 1, moves: oldState.moves || 0,
    slots: oldState.slots || 0, garden: oldState.garden || 'Entry Terrace',
    forceLevel: oldState.forceLevel != null ? oldState.forceLevel : oldProbe.forceLevel,
    forceSlot: oldState.forceSlot != null ? oldState.forceSlot : oldProbe.forceSlot,
    phase: oldState.phase || 'boot', medal: oldState.medal || 0
  };
  root.__tt = root.__tt || {};
  root.__tt.state = DEBUG;

  function currentProbeValue(key) {
    var host = objectLike(root.__tt) && objectLike(root.__tt.state) ? root.__tt.state : null;
    if (host && host[key] != null) return host[key];
    return DEBUG[key];
  }
  function publish(scene, extra) {
    var s = scene && scene.runtimeState ? scene.runtimeState : {};
    DEBUG.mode = s.mode || (scene && scene.scene && scene.scene.key) || DEBUG.mode;
    DEBUG.level = s.level == null ? DEBUG.level : s.level;
    DEBUG.moves = s.moves == null ? DEBUG.moves : s.moves;
    DEBUG.slots = saveData ? saveData.completed : DEBUG.slots;
    DEBUG.garden = s.garden || (saveData && saveData.completed >= 12 ? ZONES[3].name : (saveData ? ZONES[Math.min(3, saveData.completed / 4 | 0)].name : ZONES[0].name));
    DEBUG.phase = s.phase || DEBUG.phase;
    DEBUG.medal = s.medal == null ? DEBUG.medal : s.medal;
    if (extra) for (var k in extra) DEBUG[k] = extra[k];
    root.__tt.state = DEBUG;
  }

  function motionOn() { return !!kit && kit.juice.enabled !== false; }
  function safeSave() { return sanitizeSave(kit.save.get(blankSave())); }
  var saveData = null;
  var muted = false;

  function setMuted(value) { muted = !!value; if (kit) kit.audio.setMute(muted); }
  function toggleMute() { setMuted(!muted); }
  function duckMusic() { if (!kit || !kit.audio || !kit.audio.prefs || !kit.audio.setMusicVolume) return; var level = kit.audio.prefs.music; kit.audio.setMusicVolume(level * .45); setTimeout(function () { if (kit && kit.audio && kit.audio.setMusicVolume) kit.audio.setMusicVolume(level); }, 720); }

  function seeded(seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  var visualRand = seeded(0x7E5541);

  function makeText(scene, x, y, text, size, color, origin) {
    return scene.add.text(x, y, text, { fontFamily: FONT, fontSize: size + 'px', fontStyle: '600', color: color || '#F7FBFF', align: 'center', lineSpacing: 2 }).setOrigin(origin == null ? 0.5 : origin);
  }
  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2); ctx.beginPath(); ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function hex(n) { return '#' + ('000000' + (n >>> 0).toString(16)).slice(-6); }
  function clearCanvas(ctx, w, h, color) { ctx.fillStyle = color; ctx.fillRect(0, 0, w, h); }
  function drawStar(ctx, x, y, r, fill, points) {
    ctx.fillStyle = fill; ctx.beginPath();
    for (var i = 0; i < points * 2; i++) { var a = -Math.PI / 2 + i * Math.PI / points, q = i % 2 ? r * .45 : r; if (!i) ctx.moveTo(x + Math.cos(a) * q, y + Math.sin(a) * q); else ctx.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); }
    ctx.closePath(); ctx.fill();
  }
  function drawSymbol(ctx, type, x, y, r, fill) {
    ctx.fillStyle = fill; ctx.strokeStyle = fill; ctx.lineWidth = Math.max(1.5, r * .12);
    if (type === 0) { ctx.beginPath(); ctx.arc(x, y + r * .08, r * .43, 0, TAU); ctx.fill(); ctx.fillRect(x - r * .08, y - r * .7, r * .16, r * .35); }
    else if (type === 1) drawStar(ctx, x, y, r, fill, 4);
    else if (type === 2) { ctx.beginPath(); ctx.ellipse(x, y, r * .45, r * .85, -.6, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.moveTo(x - r * .35, y + r * .45); ctx.lineTo(x + r * .3, y - r * .45); ctx.stroke(); }
    else if (type === 3) { ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r * .65, y); ctx.arc(x, y, r * .65, 0, Math.PI); ctx.closePath(); ctx.fill(); }
    else if (type === 4) drawStar(ctx, x, y, r, fill, 5);
    else { ctx.beginPath(); ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x + r, y - r * .15, x + r * .35, y + r); ctx.quadraticCurveTo(x - r * .8, y + r * .65, x, y - r); ctx.closePath(); ctx.fill(); }
  }
  function drawGemTexture(ctx, w, h, type, special) {
    clearCanvas(ctx, w, h, 'rgba(0,0,0,0)');
    var r = w * .38, cx = w / 2, cy = h / 2;
    ctx.save(); ctx.shadowColor = 'rgba(5,12,26,.45)'; ctx.shadowBlur = 5; ctx.shadowOffsetY = 3;
    ctx.fillStyle = CSS_PALETTE[type]; ctx.strokeStyle = '#182238'; ctx.lineWidth = 2;
    ctx.beginPath();
    if (type === 0) { ctx.arc(cx, cy, r, 0, TAU); }
    else if (type === 1) { for (var i = 0; i < 8; i++) { var a = -Math.PI / 8 + i * Math.PI / 4; if (!i) ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); else ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } ctx.closePath(); }
    else if (type === 2) { ctx.ellipse(cx, cy, r * .75, r, -.55, 0, TAU); }
    else if (type === 3) { ctx.moveTo(cx, cy - r); ctx.bezierCurveTo(cx + r, cy, cx + r * .8, cy + r, cx, cy + r); ctx.bezierCurveTo(cx - r * .8, cy + r, cx - r, cy, cx, cy - r); ctx.closePath(); }
    else if (type === 4) { for (var j = 0; j < 10; j++) { var sa = -Math.PI / 2 + j * Math.PI / 5, sr = j % 2 ? r * .46 : r; if (!j) ctx.moveTo(cx + Math.cos(sa) * sr, cy + Math.sin(sa) * sr); else ctx.lineTo(cx + Math.cos(sa) * sr, cy + Math.sin(sa) * sr); } ctx.closePath(); }
    else { ctx.moveTo(cx, cy - r); ctx.quadraticCurveTo(cx + r, cy - r * .2, cx + r * .35, cy + r); ctx.quadraticCurveTo(cx - r * .8, cy + r * .72, cx, cy - r); ctx.closePath(); }
    ctx.fill(); ctx.stroke(); ctx.restore();
    drawSymbol(ctx, type, cx, cy, w * .17, '#F7FBFF');
    ctx.strokeStyle = 'rgba(255,255,255,.52)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx - 5, cy - 6, 5, Math.PI * 1.1, Math.PI * 1.75); ctx.stroke();
    if (special === SPECIAL.ROW || special === SPECIAL.COL) {
      ctx.strokeStyle = '#F7FBFF'; ctx.lineWidth = 3; ctx.beginPath();
      if (special === SPECIAL.ROW) { ctx.moveTo(cx - r * .75, cy); ctx.lineTo(cx + r * .75, cy); } else { ctx.moveTo(cx, cy - r * .75); ctx.lineTo(cx, cy + r * .75); }
      ctx.stroke();
    } else if (special === SPECIAL.BOMB) {
      ctx.strokeStyle = '#F7FBFF'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, r * .5, 0, TAU); ctx.stroke();
    } else if (special === SPECIAL.PRISM) {
      ctx.strokeStyle = '#F7FBFF'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, r * .62, 0, TAU); ctx.stroke(); drawStar(ctx, cx, cy, r * .38, '#F7FBFF', 6);
    }
  }
  function storyCells(index) {
    var patterns = [
      [[0, 0], [2, 0], [4, 0], [6, 0]],
      [[1, 1], [2, 2], [3, 3], [4, 4]],
      [[0, 6], [2, 5], [4, 4], [6, 3]],
      [[1, 6], [3, 4], [5, 2], [7, 0]]
    ];
    return patterns[index % patterns.length];
  }
  function bake(scene, key, width, height, draw) {
    if (scene.textures.exists(key)) return key;
    var texture = scene.textures.createCanvas(key, width, height);
    var ctx = texture.getContext(); draw(ctx, width, height); texture.refresh(); return key;
  }
  function bakeSharedTextures(scene) {
    bake(scene, 'tt_bg', W, H, function (ctx, w, h) {
      var g = ctx.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#223753'); g.addColorStop(.52, '#182238'); g.addColorStop(1, '#10182B'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = .12; ctx.strokeStyle = '#F7FBFF'; ctx.lineWidth = 1;
      for (var x = -h; x < w; x += 30) { ctx.beginPath(); ctx.moveTo(x, h); ctx.lineTo(x + h, 0); ctx.stroke(); }
      ctx.globalAlpha = .18; ctx.fillStyle = '#EC6B62'; ctx.beginPath(); ctx.arc(25, 240, 105, 0, TAU); ctx.fill(); ctx.fillStyle = '#5BCB77'; ctx.beginPath(); ctx.arc(370, 700, 135, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
    });
    bake(scene, 'tt_board_chrome', W, H, function (ctx) {
      var right = BOARD_X + COLS * CELL, bottom = BOARD_Y + ROWS * CELL;
      var frame = ctx.createLinearGradient(0, BOARD_Y - 18, 0, bottom + 18); frame.addColorStop(0, '#3C526E'); frame.addColorStop(.45, '#182238'); frame.addColorStop(1, '#0C1426');
      ctx.fillStyle = 'rgba(7,13,25,.72)'; rr(ctx, 9, BOARD_Y - 8, W - 18, ROWS * CELL + 16, 20); ctx.fill();
      ctx.fillStyle = frame; rr(ctx, 12, BOARD_Y - 7, W - 24, ROWS * CELL + 14, 18); ctx.fill();
      ctx.strokeStyle = '#C28B5D'; ctx.lineWidth = 2; rr(ctx, 13, BOARD_Y - 6, W - 26, ROWS * CELL + 12, 17); ctx.stroke();
      ctx.strokeStyle = 'rgba(247,201,72,.45)'; ctx.lineWidth = 1; rr(ctx, 17, BOARD_Y - 2, W - 34, ROWS * CELL + 4, 13); ctx.stroke();
      var pocket = ctx.createLinearGradient(BOARD_X, BOARD_Y, right, bottom); pocket.addColorStop(0, '#2F476C'); pocket.addColorStop(1, '#1B2C4B');
      ctx.fillStyle = pocket; rr(ctx, BOARD_X, BOARD_Y, COLS * CELL, ROWS * CELL, 10); ctx.fill();
      for (var y = 0; y < ROWS; y++) for (var x = 0; x < COLS; x++) {
        var px = BOARD_X + x * CELL + 2, py = BOARD_Y + y * CELL + 2, cellGradient = ctx.createLinearGradient(px, py, px, py + CELL - 4);
        cellGradient.addColorStop(0, (x + y) % 2 ? '#3B5579' : '#344C70'); cellGradient.addColorStop(1, (x + y) % 2 ? '#304567' : '#2A3F61');
        ctx.fillStyle = cellGradient; rr(ctx, px, py, CELL - 4, CELL - 4, 6); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.055)'; ctx.fillRect(px + 4, py + 3, CELL - 12, 2);
        ctx.fillStyle = 'rgba(6,13,28,.18)'; ctx.fillRect(px + 4, py + CELL - 8, CELL - 12, 2);
      }
      ctx.strokeStyle = 'rgba(145,180,211,.55)'; ctx.globalAlpha = .72; ctx.lineWidth = 1;
      for (var i = 0; i <= COLS; i++) { ctx.beginPath(); ctx.moveTo(BOARD_X + i * CELL, BOARD_Y); ctx.lineTo(BOARD_X + i * CELL, bottom); ctx.stroke(); ctx.beginPath(); ctx.moveTo(BOARD_X, BOARD_Y + i * CELL); ctx.lineTo(right, BOARD_Y + i * CELL); ctx.stroke(); }
      ctx.globalAlpha = 1; ctx.fillStyle = 'rgba(24,34,56,.94)'; rr(ctx, 13, 78, 364, 116, 16); ctx.fill();
      ctx.strokeStyle = '#5D7294'; ctx.lineWidth = 1; rr(ctx, 14, 79, 362, 114, 15); ctx.stroke();
    });
    bake(scene, 'tt_selector', 54, 54, function (ctx, w, h) { ctx.strokeStyle = '#F7FBFF'; ctx.lineWidth = 3; rr(ctx, 4, 4, w - 8, h - 8, 11); ctx.stroke(); ctx.strokeStyle = '#F7C948'; ctx.lineWidth = 1; rr(ctx, 8, 8, w - 16, h - 16, 8); ctx.stroke(); });
    bake(scene, 'tt_ghost', 44, 44, function (ctx, w, h) { ctx.fillStyle = 'rgba(247,251,255,.16)'; rr(ctx, 4, 4, w - 8, h - 8, 10); ctx.fill(); ctx.strokeStyle = '#F7FBFF'; ctx.lineWidth = 2; ctx.setLineDash([5, 3]); rr(ctx, 4, 4, w - 8, h - 8, 10); ctx.stroke(); ctx.setLineDash([]); });
    bake(scene, 'tt_arrow', 44, 44, function (ctx, w, h) { ctx.strokeStyle = '#F7C948'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(8, 22); ctx.lineTo(33, 22); ctx.lineTo(28, 16); ctx.moveTo(33, 22); ctx.lineTo(28, 28); ctx.stroke(); });
    bake(scene, 'tt_story_mark', 44, 44, function (ctx, w, h) { ctx.strokeStyle = 'rgba(247,201,72,.72)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(w - 7, 7, 3, 0, TAU); ctx.stroke(); ctx.fillStyle = 'rgba(247,201,72,.7)'; ctx.fillRect(w - 8, 5.5, 2, 3); });
    bake(scene, 'tt_chip', 160, 32, function (ctx, w, h) { ctx.fillStyle = 'rgba(18,34,44,.94)'; rr(ctx, 0, 0, w, h, 12); ctx.fill(); ctx.strokeStyle = '#5DB7D8'; ctx.lineWidth = 1; rr(ctx, .5, .5, w - 1, h - 1, 12); ctx.stroke(); });
    for (var type = 0; type < 6; type++) for (var special = 0; special < 5; special++) {
      var key = 'tt_gem_' + type + '_' + special;
      bake(scene, key, 44, 44, (function (t, sp) { return function (ctx, w, h) { drawGemTexture(ctx, w, h, t, sp); }; })(type, special));
    }
    bake(scene, 'tt_dust', 14, 14, function (ctx, w, h) { ctx.fillStyle = '#D9C9B5'; ctx.fillRect(2, 4, 10, 7); ctx.fillRect(4, 1, 5, 12); });
    bake(scene, 'tt_spark', 16, 16, function (ctx, w, h) { drawStar(ctx, 8, 8, 7, '#FFF8EE', 4); });
    bake(scene, 'tt_medal', 28, 28, function (ctx, w, h) { drawStar(ctx, 14, 13, 11, '#F7C948', 5); ctx.fillStyle = '#FFF8EE'; ctx.beginPath(); ctx.arc(14, 13, 3, 0, TAU); ctx.fill(); });
  }

  function makeButton(scene, x, y, w, h, label, callback, opts) {
    opts = opts || {};
    var c = scene.add.container(x, y).setDepth(opts.depth || 40);
    var bg = scene.add.rectangle(0, 0, w, h, opts.fill == null ? BOARD : opts.fill, opts.alpha == null ? 1 : opts.alpha);
    bg.setStrokeStyle(opts.strokeWidth || 2, opts.stroke == null ? 0x5D7294 : opts.stroke, .95);
    bg.setInteractive(new PhaserRef.Geom.Rectangle(-w / 2, -h / 2, w, h), PhaserRef.Geom.Rectangle.Contains);
    var t = makeText(scene, opts.icon || label, 0, opts.sub ? -6 : 0, opts.size || 14, opts.color || '#F7FBFF');
    c.add([bg, t]); c.bg = bg; c.label = t; c.enabled = opts.enabled !== false; c.w = w; c.h = h;
    if (opts.sub) { c.sub = makeText(scene, opts.sub, 0, 13, opts.subSize || 10, opts.subColor || '#D7E0F0'); c.add(c.sub); }
    var pressId = null, pressed = false;
    function clearPress() { pressId = null; pressed = false; c.setScale(1); }
    bg.on('pointerdown', function (pointer) {
      claimPointer(pointer, 'button');
      if (!c.enabled) return;
      pressId = pointer.id; pressed = true; c.setScale(motionOn() ? .96 : 1);
    });
    bg.on('pointerup', function (pointer) {
      if (!pressed || pressId !== pointer.id) return;
      var shouldActivate = c.enabled; clearPress();
      if (shouldActivate && callback) { kit.audio.sfx('ui', { volume: .35 }); callback(); }
    });
    bg.on('pointerupoutside', clearPress);
    bg.on('pointerover', function () { if (c.enabled && !pressed) c.setScale(motionOn() ? 1.025 : 1); });
    bg.on('pointerout', function () { if (pressed) clearPress(); else c.setScale(1); });
    c.setEnabled = function (enabled) { c.enabled = !!enabled; bg.input.enabled = c.enabled; c.setAlpha(c.enabled ? 1 : .4); };
    c.setEnabled(c.enabled); return c;
  }
  function claimPointer(pointer, zone) {
    if (!kit || !kit.input || !kit.input.pointers) return;
    var id = pointer.id != null ? pointer.id : pointer.pointerId;
    var event = pointer.event || {};
    var x = Number.isFinite(event.clientX) ? event.clientX : pointer.x || 0;
    var y = Number.isFinite(event.clientY) ? event.clientY : pointer.y || 0;
    var point = kit.input.pointers.get(id);
    if (!point) {
      point = { x: x, y: y, startX: x, startY: y, downAt: performance.now(), zone: zone || null };
      kit.input.pointers.set(id, point);
    } else if (zone) point.zone = zone;
    return point;
  }
  function wireDraw(scene) { scene.sys.events.on('prerender', scene.draw, scene); }
  function unwireDraw(scene) { if (scene && scene.sys && scene.draw) scene.sys.events.off('prerender', scene.draw, scene); }
  function setButtonLabel(button, value) { if (button && button.label) setTextIfChanged(button.label, value); }

  function gardenSlotPosition(id) {
    var row = id >= 12 ? 3 : (id / 4 | 0), offset = id >= 12 ? id - 12 : id % 4;
    var terraces = [{ x: 18, y: 512, w: 354, h: 54 }, { x: 42, y: 412, w: 306, h: 52 }, { x: 68, y: 310, w: 254, h: 50 }, { x: 104, y: 216, w: 182, h: 45 }];
    var count = row === 3 ? 3 : 4, terrace = terraces[row];
    return { x: terrace.x + terrace.w * ((offset + .5) / count), y: terrace.y - 4 };
  }
  function buildGarden(ctx, w, h, state, now, buildSlot, buildVariant, buildProgress) {
    var completed = state.completed | 0, night = (1 - Math.cos((now % 1) * TAU)) / 2;
    var zoneLevel = Math.min(3, Math.floor(completed / 4));
    var skyA = ['#CDE8E6', '#C8E2E6', '#DCEAC7', '#C9D5EB'][zoneLevel];
    var skyB = ['#F9E2C0', '#F6D4B2', '#F3D7A6', '#D8C9E7'][zoneLevel];
    var duskA = ['#23334E', '#203953', '#26384A', '#272A50'][zoneLevel];
    var duskB = ['#79566B', '#75536A', '#765A65', '#5A4C75'][zoneLevel];
    var g = ctx.createLinearGradient(0, 0, 0, h * .68); g.addColorStop(0, mix(skyA, duskA, night)); g.addColorStop(1, mix(skyB, duskB, night)); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = .75; ctx.fillStyle = night > .55 ? '#F7FBFF' : '#F3BC50'; var sunX = 54 + ((now % 1) * 282), sunY = 104 + Math.sin((now % 1) * Math.PI) * -55; ctx.beginPath(); ctx.arc(sunX, sunY, night > .55 ? 12 : 16, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
    if (night > .52) { ctx.fillStyle = '#FFF8EE'; for (var star = 0; star < 18; star++) { ctx.globalAlpha = .3 + .5 * Math.abs(Math.sin(now * 3 + star)); ctx.fillRect(18 + (star * 73) % 350, 62 + (star * 41) % 160, 2, 2); } ctx.globalAlpha = 1; }
    ctx.fillStyle = mix('#8CAFA6', '#26374A', night); ctx.beginPath(); ctx.moveTo(0, 390); for (var i = 0; i <= 10; i++) ctx.lineTo(i * 40, 350 - Math.sin(i * 1.25) * 28); ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath(); ctx.fill();
    ctx.fillStyle = mix('#7C9567', '#27372F', night); ctx.beginPath(); ctx.moveTo(-10, h); ctx.lineTo(-10, 440); ctx.quadraticCurveTo(90, 310, 195, 148); ctx.quadraticCurveTo(300, 308, 400, 440); ctx.lineTo(400, h); ctx.closePath(); ctx.fill();
    var terraces = [{ x: 18, y: 512, w: 354, h: 54 }, { x: 42, y: 412, w: 306, h: 52 }, { x: 68, y: 310, w: 254, h: 50 }, { x: 104, y: 216, w: 182, h: 45 }];
    for (var tr = 3; tr >= 0; tr--) {
      var terrace = terraces[tr], slotStart = tr * 4, slotCount = tr === 3 ? 3 : 4;
      ctx.fillStyle = mix('#9B7056', '#3A3437', night); ctx.fillRect(terrace.x - 6, terrace.y, terrace.w + 12, terrace.h);
      ctx.fillStyle = mix('#B88563', '#4C3B3B', night); ctx.beginPath(); ctx.moveTo(terrace.x - 10, terrace.y); ctx.lineTo(terrace.x + terrace.w + 10, terrace.y); ctx.lineTo(terrace.x + terrace.w - 4, terrace.y - 14); ctx.lineTo(terrace.x + 4, terrace.y - 14); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(38,29,28,.2)'; for (var line = 0; line < 4; line++) ctx.fillRect(terrace.x - 5, terrace.y + 8 + line * 12, terrace.w + 10, 2);
      ctx.strokeStyle = mix('#D4A47A', '#5A4548', night); ctx.lineWidth = 1; for (var stoneRow = 0; stoneRow < 3; stoneRow++) for (var stone = 0; stone < Math.ceil(terrace.w / 28); stone++) { var sx = terrace.x - 5 + stone * 28 + (stoneRow % 2) * 10, sy = terrace.y + 7 + stoneRow * 13; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(Math.min(terrace.x + terrace.w + 5, sx + 22), sy); ctx.stroke(); }
      ctx.fillStyle = mix('#6B7F50', '#293D35', night); ctx.globalAlpha = .45; ctx.fillRect(terrace.x + 5, terrace.y - 11, terrace.w - 10, 3); ctx.globalAlpha = 1;
      for (var si = 0; si < slotCount; si++) {
        var id = slotStart + si, slot = SLOTS[id], built = id < completed || id === buildSlot;
        var px = terrace.x + terrace.w * ((si + .5) / slotCount), py = terrace.y - 4;
        if (!built) { ctx.strokeStyle = 'rgba(255,248,238,.28)'; ctx.lineWidth = 2; ctx.setLineDash([4, 4]); rr(ctx, px - 20, py - 35, 40, 35, 6); ctx.stroke(); ctx.setLineDash([]); continue; }
        var v = id === buildSlot ? buildVariant : (state.choices[id] === 1 ? 1 : 0), age = id === buildSlot ? clamp(buildProgress == null ? 1 : buildProgress, 0, 1) : 1;
        if (id === buildSlot) { ctx.save(); ctx.globalAlpha = .25 + .75 * age; var scale = .72 + .28 * easeBack(age); ctx.translate(px, py); ctx.scale(scale, scale); ctx.translate(-px, -py); }
        drawGardenProp(ctx, slot.art[v], px, py, night, now);
        if (id === buildSlot) ctx.restore();
      }
    }
    ctx.fillStyle = mix('#4F6B42', '#203027', night); ctx.fillRect(0, 610, w, h - 610);
    ctx.fillStyle = 'rgba(255,248,238,.28)'; ctx.fillRect(0, 610, w, 2);
    if (completed >= 15 || buildSlot === 14) {
      ctx.strokeStyle = night > .48 ? '#F7C948' : '#D6C48C'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(192, 216); ctx.lineTo(192, 164); ctx.stroke(); ctx.fillStyle = night > .48 ? '#F7C948' : '#D6C48C'; ctx.beginPath(); ctx.arc(192, 158, 12, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#5DB7D8'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(260, 518, 33, 12, 0, 0, TAU); ctx.stroke();
    }
  }
  function mix(a, b, t) {
    function p(v, n) { return parseInt(v.slice(n, n + 2), 16); }
    var r = Math.round(p(a, 1) + (p(b, 1) - p(a, 1)) * t), g = Math.round(p(a, 3) + (p(b, 3) - p(a, 3)) * t), bl = Math.round(p(a, 5) + (p(b, 5) - p(a, 5)) * t);
    return 'rgb(' + r + ',' + g + ',' + bl + ')';
  }
  function drawGardenProp(ctx, art, x, y, night, now) {
    var dark = night > .55, wood = dark ? '#5A4037' : '#A86F4C', leaf = dark ? '#35543D' : '#4F9D69', water = dark ? '#234F72' : '#5DB7D8';
    ctx.save(); ctx.globalAlpha = dark ? .28 : .2; ctx.fillStyle = '#182238'; ctx.beginPath(); ctx.ellipse(x, y + 2, 34, 6, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
    ctx.lineWidth = 2; ctx.strokeStyle = '#2B2D42';
    if (art === 'wall') { for (var r = 0; r < 3; r++) for (var c = 0; c < 4; c++) { ctx.fillStyle = r % 2 ? '#A6A29A' : '#C5BDB0'; ctx.fillRect(x - 31 + c * 16 + (r % 2) * 4, y - 5 - r * 7, 14, 6); } }
    else if (art === 'willow') { ctx.fillStyle = wood; ctx.fillRect(x - 30, y - 5, 60, 5); ctx.strokeStyle = '#C28B5D'; for (var wi = 0; wi < 7; wi++) { ctx.beginPath(); ctx.moveTo(x - 26 + wi * 9, y - 5); ctx.quadraticCurveTo(x - 21 + wi * 9, y - 20, x - 25 + wi * 9, y - 25); ctx.stroke(); } }
    else if (art === 'basin') { ctx.fillStyle = '#827B72'; rr(ctx, x - 23, y - 15, 46, 15, 4); ctx.fill(); ctx.fillStyle = water; ctx.fillRect(x - 18, y - 12, 36, 6); ctx.fillStyle = '#9ABAA3'; ctx.fillRect(x - 3, y - 25, 6, 12); }
    else if (art === 'rill') { ctx.fillStyle = water; ctx.fillRect(x - 31, y - 7, 62, 5); ctx.fillStyle = '#D7F0E5'; ctx.fillRect(x - 18 + (now * 30) % 40, y - 7, 9, 5); for (var rrI = 0; rrI < 4; rrI++) { ctx.fillStyle = leaf; ctx.fillRect(x - 25 + rrI * 16, y - 20, 2, 13); } }
    else if (art === 'herbs' || art === 'wildflowers') { ctx.fillStyle = '#5A4534'; ctx.fillRect(x - 28, y - 6, 56, 6); for (var hi = 0; hi < 8; hi++) { ctx.fillStyle = leaf; ctx.fillRect(x - 25 + hi * 7, y - 17 - (hi % 2) * 5, 2, 12); ctx.fillStyle = art === 'herbs' ? '#F3BC50' : (hi % 2 ? '#EC6B62' : '#9A7CF3'); ctx.beginPath(); ctx.arc(x - 24 + hi * 7, y - 18 - (hi % 2) * 5, 3, 0, TAU); ctx.fill(); } }
    else if (art === 'bench' || art === 'deck') { ctx.fillStyle = wood; ctx.fillRect(x - 27, y - 7, 54, 7); ctx.fillRect(x - 21, y, 5, 7); ctx.fillRect(x + 16, y, 5, 7); if (art === 'deck') { ctx.strokeStyle = '#6A4837'; for (var bi = 0; bi < 6; bi++) { ctx.beginPath(); ctx.moveTo(x - 25 + bi * 10, y - 7); ctx.lineTo(x - 25 + bi * 10, y); ctx.stroke(); } } }
    else if (art === 'espalier' || art === 'plum') { ctx.fillStyle = wood; ctx.fillRect(x - 3, y - 33, 6, 33); ctx.fillRect(x - 25, y - 31, 50, 3); ctx.fillStyle = leaf; ctx.beginPath(); ctx.arc(x - 12, y - 28, 9, 0, TAU); ctx.arc(x + 12, y - 25, 10, 0, TAU); ctx.fill(); if (art === 'plum') { ctx.fillStyle = '#6B4C9B'; ctx.beginPath(); ctx.arc(x - 8, y - 36, 3, 0, TAU); ctx.arc(x + 11, y - 39, 3, 0, TAU); ctx.fill(); } }
    else if (art === 'gravel' || art === 'stones') { for (var pi = 0; pi < 6; pi++) { ctx.fillStyle = pi % 2 ? '#C5BDB0' : '#A6A29A'; ctx.beginPath(); ctx.ellipse(x - 26 + pi * 11, y - 3, art === 'stones' ? 7 : 5, 3, 0, 0, TAU); ctx.fill(); } }
    else if (art === 'shed' || art === 'arbour') { if (art === 'shed') { ctx.fillStyle = wood; ctx.fillRect(x - 23, y - 27, 46, 27); ctx.fillStyle = '#6F4B3C'; ctx.beginPath(); ctx.moveTo(x - 28, y - 27); ctx.lineTo(x, y - 43); ctx.lineTo(x + 28, y - 27); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#2C3F61'; ctx.fillRect(x - 5, y - 17, 10, 17); } else { ctx.strokeStyle = wood; ctx.lineWidth = 4; ctx.strokeRect(x - 24, y - 32, 48, 32); ctx.fillStyle = leaf; ctx.beginPath(); ctx.arc(x - 20, y - 31, 8, 0, TAU); ctx.arc(x + 20, y - 28, 8, 0, TAU); ctx.fill(); } }
    else if (art === 'lanterns' || art === 'fire') { if (art === 'lanterns') for (var li = 0; li < 3; li++) { var lx = x - 23 + li * 23; ctx.fillStyle = '#4A3A35'; ctx.fillRect(lx - 2, y - 31, 4, 31); ctx.fillStyle = dark ? '#F7C948' : '#D6C48C'; ctx.fillRect(lx - 5, y - 39, 10, 9); } else { ctx.fillStyle = '#827B72'; ctx.fillRect(x - 15, y - 7, 30, 7); ctx.fillStyle = dark ? '#F29A4A' : '#EC6B62'; ctx.beginPath(); ctx.moveTo(x - 9, y - 7); ctx.quadraticCurveTo(x, y - 28 - Math.sin(now * 5) * 3, x + 9, y - 7); ctx.closePath(); ctx.fill(); } }
    else if (art === 'cloches' || art === 'screens') { ctx.strokeStyle = '#D7F0E5'; ctx.lineWidth = 2; for (var ci = 0; ci < 3; ci++) { ctx.beginPath(); ctx.arc(x - 20 + ci * 20, y, 10, Math.PI, 0); ctx.stroke(); } if (art === 'screens') { ctx.strokeStyle = wood; for (var sc = 0; sc < 4; sc++) { ctx.beginPath(); ctx.moveTo(x - 24 + sc * 16, y - 25); ctx.lineTo(x - 24 + sc * 16, y); ctx.stroke(); } } }
    else if (art === 'rockery' || art === 'moss') { for (var ro = 0; ro < 6; ro++) { ctx.fillStyle = ro % 2 ? '#A6A29A' : '#817F77'; ctx.beginPath(); ctx.arc(x - 24 + ro * 10, y - 4, 5 + ro % 3, 0, TAU); ctx.fill(); } if (art === 'moss') { ctx.fillStyle = leaf; ctx.beginPath(); ctx.ellipse(x, y - 8, 25, 5, 0, 0, TAU); ctx.fill(); } }
    else if (art === 'pool' || art === 'mist') { ctx.strokeStyle = water; ctx.lineWidth = 3; for (var mi = 0; mi < 3; mi++) { ctx.beginPath(); ctx.moveTo(x - 26, y - 5 - mi * 7); ctx.quadraticCurveTo(x, y - 12 - mi * 7 + Math.sin(now * 2 + mi) * 2, x + 26, y - 5 - mi * 7); ctx.stroke(); } }
    else if (art === 'bell' || art === 'trellis') { ctx.strokeStyle = wood; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 38); ctx.moveTo(x - 22, y - 30); ctx.lineTo(x + 22, y - 30); ctx.stroke(); if (art === 'bell') { ctx.fillStyle = dark ? '#F7C948' : '#D6C48C'; ctx.beginPath(); ctx.arc(x, y - 22, 8, 0, Math.PI); ctx.fill(); } else { ctx.fillStyle = leaf; for (var ti = 0; ti < 5; ti++) { ctx.beginPath(); ctx.arc(x - 20 + ti * 10, y - 19 + (ti % 2) * 6, 4, 0, TAU); ctx.fill(); } } }
    else if (art === 'switchback' || art === 'flight') { ctx.fillStyle = '#A6A29A'; for (var st = 0; st < 6; st++) { var sx = art === 'flight' ? x - 17 : x - 24 + (st % 2) * 14; ctx.fillRect(sx, y - 5 - st * 6, 34, 5); } }
    else if (art === 'gate' || art === 'arch') { ctx.strokeStyle = art === 'gate' ? '#5C6972' : leaf; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x - 23, y); ctx.lineTo(x - 23, y - 26); ctx.quadraticCurveTo(x, y - 56, x + 23, y - 26); ctx.lineTo(x + 23, y); ctx.stroke(); if (art === 'gate') { ctx.lineWidth = 2; for (var gi = 0; gi < 5; gi++) { ctx.beginPath(); ctx.moveTo(x - 17 + gi * 9, y); ctx.lineTo(x - 17 + gi * 9, y - 30); ctx.stroke(); } } }
    else if (art === 'beacon' || art === 'pond') { if (art === 'beacon') { ctx.fillStyle = wood; ctx.fillRect(x - 4, y - 36, 8, 36); ctx.fillStyle = dark ? '#F7C948' : '#D6C48C'; ctx.beginPath(); ctx.arc(x, y - 44, 15, 0, TAU); ctx.fill(); } else { ctx.fillStyle = '#2B6680'; ctx.beginPath(); ctx.ellipse(x, y - 7, 31, 11, 0, 0, TAU); ctx.fill(); for (var po = 0; po < 5; po++) { ctx.fillStyle = '#F7C948'; ctx.beginPath(); ctx.arc(x - 20 + po * 10, y - 8 + Math.sin(now + po) * 3, 2, 0, TAU); ctx.fill(); } } }
    ctx.globalAlpha = dark ? .22 : .3; ctx.fillStyle = '#FFF8EE'; for (var glint = 0; glint < 3; glint++) { ctx.beginPath(); ctx.arc(x - 14 + glint * 13, y - 28 - (glint % 2) * 5, 1.5, 0, TAU); ctx.fill(); } ctx.globalAlpha = 1; ctx.restore();
  }
  function drawVariantPreview(ctx, w, h, slot, variant, index) {
    ctx.save(); ctx.scale(w / 390, h / 210); clearCanvas(ctx, 390, 210, '#CDE8E6');
    var sky = ctx.createLinearGradient(0, 0, 0, 210); sky.addColorStop(0, '#B9D9D2'); sky.addColorStop(1, '#F3D7A6'); ctx.fillStyle = sky; ctx.fillRect(0, 0, 390, 210);
    ctx.fillStyle = '#8CAFA6'; ctx.beginPath(); ctx.moveTo(0, 146); ctx.quadraticCurveTo(105, 76, 195, 126); ctx.quadraticCurveTo(286, 72, 390, 142); ctx.lineTo(390, 210); ctx.lineTo(0, 210); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#A86F4C'; ctx.fillRect(20, 164, 350, 32); ctx.fillStyle = '#B88563'; ctx.fillRect(20, 160, 350, 7); ctx.fillStyle = '#5A4534'; ctx.fillRect(30, 185, 330, 5);
    drawGardenProp(ctx, slot.art[variant], 195, 164, .05, .28 + index * .02);
    ctx.fillStyle = 'rgba(255,248,238,.28)'; ctx.fillRect(0, 0, 390, 210); ctx.restore();
  }

  function MatchBoard(spec) {
    var storyIndex = Math.max(0, LEVELS.indexOf(spec)); this.cols = COLS; this.rows = ROWS; this.n = spec.colors; this.rand = seeded(spec.seed); this.cells = new Array(64); this.freeBombs = spec.freeBombs | 0; this.previewType = null; this.storyPattern = STORY_BEATS[storyIndex].motif; this.storyCells = storyCells(storyIndex); this.reset();
  }
  MatchBoard.prototype.index = function (x, y) { return y * COLS + x; };
  MatchBoard.prototype.at = function (x, y) { return x < 0 || y < 0 || x >= COLS || y >= ROWS ? null : this.cells[this.index(x, y)]; };
  MatchBoard.prototype.peekType = function () { if (this.previewType == null) this.previewType = (this.rand() * this.n) | 0; return this.previewType; };
  MatchBoard.prototype.newCell = function (type) { if (type == null) { type = this.peekType(); this.previewType = null; } return { type: type, special: SPECIAL.NONE }; };
  MatchBoard.prototype.reset = function () {
    for (var y = 0; y < ROWS; y++) for (var x = 0; x < COLS; x++) {
      var type, guard = 0;
      do { type = (this.rand() * this.n) | 0; guard++; } while (((x > 1 && this.at(x - 1, y) && this.at(x - 2, y) && this.at(x - 1, y).type === type && this.at(x - 2, y).type === type) || (y > 1 && this.at(x, y - 1) && this.at(x, y - 2) && this.at(x, y - 1).type === type && this.at(x, y - 2).type === type)) && guard < 24);
      this.cells[this.index(x, y)] = this.newCell(type);
    }
    if (!this.hasMove()) this.shuffle();
    var safeBombs = [[1, 1], [6, 5]];
    for (var b = 0; b < this.freeBombs; b++) { var p = safeBombs[b] || [b + 1, 6]; var c = this.at(p[0], p[1]); if (c) c.special = SPECIAL.PRISM; }
    this.freeBombs = 0;
  };
  MatchBoard.prototype.swap = function (a, b) { var ai = this.index(a.x, a.y), bi = this.index(b.x, b.y), t = this.cells[ai]; this.cells[ai] = this.cells[bi]; this.cells[bi] = t; };
  MatchBoard.prototype.runs = function () {
    var runs = [], x, y;
    for (y = 0; y < ROWS; y++) { var len = 1; for (x = 1; x <= COLS; x++) { var cur = x < COLS ? this.at(x, y) : null, prev = this.at(x - 1, y); if (cur && prev && cur.type === prev.type) len++; else { if (len >= 3 && prev) runs.push({ x: x - len, y: y, len: len, type: prev.type, horizontal: true }); len = 1; } } }
    for (x = 0; x < COLS; x++) { var lenV = 1; for (y = 1; y <= ROWS; y++) { var curV = y < ROWS ? this.at(x, y) : null, prevV = this.at(x, y - 1); if (curV && prevV && curV.type === prevV.type) lenV++; else { if (lenV >= 3 && prevV) runs.push({ x: x, y: y - lenV, len: lenV, type: prevV.type, horizontal: false }); lenV = 1; } } }
    return runs;
  };
  MatchBoard.prototype.matchInfo = function (prefer) {
    var runs = this.runs(); if (!runs.length) return null; var clear = Object.create(null), specials = [], cellRuns = Object.create(null);
    for (var i = 0; i < runs.length; i++) for (var j = 0; j < runs[i].len; j++) { var x = runs[i].horizontal ? runs[i].x + j : runs[i].x, y = runs[i].horizontal ? runs[i].y : runs[i].y + j, idx = this.index(x, y); clear[idx] = true; (cellRuns[idx] || (cellRuns[idx] = [])).push(i); }
    var used = Object.create(null);
    for (var k = 0; k < runs.length; k++) { if (used[k]) continue; var run = runs[k], pivot = -1, ids = []; for (var p = 0; p < run.len; p++) { var xx = run.horizontal ? run.x + p : run.x, yy = run.horizontal ? run.y : run.y + p, ii = this.index(xx, yy); ids.push(ii); if (prefer === ii) pivot = ii; }
      var cross = -1, other = -1; for (var q = 0; q < ids.length; q++) { var memberships = cellRuns[ids[q]] || []; for (var m = 0; m < memberships.length; m++) if (memberships[m] !== k && !used[memberships[m]]) { cross = ids[q]; other = memberships[m]; break; } if (cross >= 0) break; }
      if (cross >= 0) { used[k] = true; used[other] = true; specials.push({ index: pivot >= 0 ? pivot : cross, special: SPECIAL.BOMB, type: run.type }); }
      else if (run.len >= 5) { used[k] = true; specials.push({ index: pivot >= 0 ? pivot : ids[(run.len / 2) | 0], special: SPECIAL.PRISM, type: run.type }); }
      else if (run.len === 4) { used[k] = true; specials.push({ index: pivot >= 0 ? pivot : ids[1], special: run.horizontal ? SPECIAL.ROW : SPECIAL.COL, type: run.type }); }
    }
    var list = Object.keys(clear).map(function (v) { return Number(v); }); return { clear: list, specials: specials };
  };
  MatchBoard.prototype.expand = function (clear) {
    var set = Object.create(null), queue = clear.slice(), triggered = false;
    for (var i = 0; i < clear.length; i++) set[clear[i]] = true;
    while (queue.length) { var idx = queue.pop(), cell = this.cells[idx]; if (!cell || cell.special === SPECIAL.NONE) continue; triggered = true; var x = idx % COLS, y = idx / COLS | 0, add = [];
      if (cell.special === SPECIAL.ROW) for (var cx = 0; cx < COLS; cx++) add.push(this.index(cx, y));
      else if (cell.special === SPECIAL.COL) for (var cy = 0; cy < ROWS; cy++) add.push(this.index(x, cy));
      else if (cell.special === SPECIAL.BOMB) for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) if (this.at(x + dx, y + dy)) add.push(this.index(x + dx, y + dy));
      else if (cell.special === SPECIAL.PRISM) for (var z = 0; z < this.cells.length; z++) if (this.cells[z] && this.cells[z].type === cell.type) add.push(z);
      for (var a = 0; a < add.length; a++) if (!set[add[a]]) { set[add[a]] = true; queue.push(add[a]); }
    }
    return { list: Object.keys(set).map(function (v) { return Number(v); }), triggered: triggered };
  };
  MatchBoard.prototype.resolve = function (info) {
    var expanded = this.expand(info.clear), spawnMap = Object.create(null), i, j;
    for (i = 0; i < info.specials.length; i++) spawnMap[info.specials[i].index] = info.specials[i];
    var removed = [], spawned = [];
    for (j = 0; j < expanded.list.length; j++) { var idx = expanded.list[j], cell = this.cells[idx]; if (!cell) continue; if (spawnMap[idx]) { cell.special = spawnMap[idx].special; spawned.push(idx); delete spawnMap[idx]; } else { removed.push({ index: idx, type: cell.type }); this.cells[idx] = null; } }
    for (var key in spawnMap) if (this.cells[key | 0]) this.cells[key | 0].special = spawnMap[key].special;
    return { removed: removed, spawned: spawned, triggered: expanded.triggered };
  };
  MatchBoard.prototype.collapse = function () {
    var falls = [], bombs = 0;
    for (var x = 0; x < COLS; x++) { var write = ROWS - 1; for (var y = ROWS - 1; y >= 0; y--) { var cell = this.at(x, y); if (cell) { if (write !== y) { this.cells[this.index(x, write)] = cell; this.cells[this.index(x, y)] = null; falls.push({ index: this.index(x, write), fromY: y - write }); } write--; } }
      for (var spawnY = write; spawnY >= 0; spawnY--) { var fresh = this.newCell(); if (this.freeBombs > 0 && bombs < this.freeBombs) { fresh.special = SPECIAL.PRISM; bombs++; } this.cells[this.index(x, spawnY)] = fresh; falls.push({ index: this.index(x, spawnY), fromY: spawnY - (write + 1) }); }
    }
    this.freeBombs = Math.max(0, this.freeBombs - bombs); return falls;
  };
  MatchBoard.prototype.testSwap = function (a, b) { if (!this.at(a.x, a.y) || !this.at(b.x, b.y)) return false; if (this.at(a.x, a.y).special === SPECIAL.PRISM || this.at(b.x, b.y).special === SPECIAL.PRISM) return true; this.swap(a, b); var hit = !!this.matchInfo(); this.swap(a, b); return hit; };
  MatchBoard.prototype.hasMove = function () { for (var y = 0; y < ROWS; y++) for (var x = 0; x < COLS; x++) { if (x < COLS - 1 && this.testSwap({ x: x, y: y }, { x: x + 1, y: y })) return true; if (y < ROWS - 1 && this.testSwap({ x: x, y: y }, { x: x, y: y + 1 })) return true; } return false; };
  MatchBoard.prototype.rebuildPlayable = function () { for (var y = 0; y < ROWS; y++) for (var x = 0; x < COLS; x++) this.cells[this.index(x, y)] = this.newCell((x + y * 2) % this.n); this.cells[this.index(0, 0)].type = 0; this.cells[this.index(1, 0)].type = 0; this.cells[this.index(2, 0)].type = 1 % this.n; this.cells[this.index(3, 0)].type = 0; };
  MatchBoard.prototype.shuffle = function () { var types = this.cells.map(function (c) { return c ? c.type : 0; }), tries = 0; this.previewType = null; do { for (var i = types.length - 1; i > 0; i--) { var j = (this.rand() * (i + 1)) | 0, t = types[i]; types[i] = types[j]; types[j] = t; } for (var k = 0; k < this.cells.length; k++) { this.cells[k] = this.newCell(types[k]); } tries++; } while ((this.matchInfo() || !this.hasMove()) && tries < 50); if (this.matchInfo() || !this.hasMove()) this.rebuildPlayable(); };

  function medalFor(spec, movesLeft, bestStreak, hintUsed) {
    var silver = movesLeft >= 7 && bestStreak >= 2, gold = movesLeft >= Math.max(9, Math.floor(spec.moves * .38)) && bestStreak >= 3 && !hintUsed;
    return gold ? 3 : silver ? 2 : 1;
  }
  function medalGlyph(level) { return level >= 3 ? '★' : level === 2 ? '◆' : level === 1 ? '●' : '○'; }
  function goalColor(color) { return CSS_PALETTE[color] || '#F7FBFF'; }

  function baseScene(scene, mode, gardenTime) {
    scene.runtimeState = { mode: mode, level: DEBUG.level, moves: DEBUG.moves, garden: DEBUG.garden, phase: DEBUG.phase };
    scene.clock = 0; scene.accumulator = 0; scene.gardenTime = gardenTime == null ? .16 : gardenTime;
    scene.gardenRenderT = 1;
    root.__tt._keyState = root.__tt._keyState || Object.create(null);
    scene.keyPressed = function (code) {
      var down = !!kit && kit.input.keyDown(code), previous = root.__tt._keyState[code] === true;
      root.__tt._keyState[code] = down;
      return down && !previous;
    };
    scene.stepFixed = function () { scene.clock += STEP; };
  }
  function fixedSteps(scene, delta, callback) {
    var amount = Math.min(Math.max(Number(delta) || 0, 0) / 1000, .05);
    scene.accumulator += amount;
    var steps = Math.min(3, Math.floor(scene.accumulator / STEP));
    scene.accumulator -= steps * STEP;
    for (var i = 0; i < steps; i++) callback(i);
    return steps;
  }
  function pollGlobalKeys(scene, escapeToHub) {
    if (scene.keyPressed('KeyM')) toggleMute();
    if (escapeToHub && scene.keyPressed('Escape')) { scene.scene.start('hub'); return true; }
    return false;
  }
  function updateGardenTexture(scene, buildSlot, buildVariant, elapsed, force, buildProgress) {
    if (force) scene.gardenRenderT = 0;
    else {
      scene.gardenRenderT += elapsed == null ? STEP : elapsed;
      if (scene.gardenRenderT < .05) return;
      scene.gardenRenderT = 0;
    }
    var tex = scene.textures.get('tt_garden');
    if (!tex) { bake(scene, 'tt_garden', W, H, function (ctx, w, h) { buildGarden(ctx, w, h, saveData, scene.gardenTime, buildSlot, buildVariant, buildProgress); }); tex = scene.textures.get('tt_garden'); }
    var ctx = tex.getContext(); buildGarden(ctx, W, H, saveData, scene.gardenTime, buildSlot, buildVariant, buildProgress); tex.refresh();
  }
  function gardenImage(scene, buildSlot, buildVariant, buildProgress) {
    if (!scene.textures.exists('tt_garden')) bake(scene, 'tt_garden', W, H, function (ctx, w, h) { buildGarden(ctx, w, h, saveData, scene.gardenTime || .16, buildSlot, buildVariant, buildProgress); });
    else { var texture = scene.textures.get('tt_garden'); buildGarden(texture.getContext(), W, H, saveData, scene.gardenTime || .16, buildSlot, buildVariant, buildProgress); texture.refresh(); }
    scene.gardenRenderT = 0;
    return scene.add.image(W / 2, H / 2, 'tt_garden').setDepth(0);
  }
  function header(scene, title, sub) { var h = scene.add.rectangle(W / 2, 42, W, 84, 0x10182B, .9).setDepth(20); h.setStrokeStyle(1, 0x5D7294, .3); makeText(scene, 18, 22, title, 25, '#F7FBFF', 0).setDepth(21); makeText(scene, 18, 55, sub, 14, '#D7E0F0', 0).setDepth(21); return h; }

  function BootScene() { PhaserRef.Scene.call(this, { key: 'boot' }); }
  BootScene.prototype = Object.create(PhaserRef.Scene.prototype); BootScene.prototype.constructor = BootScene;
  BootScene.prototype.create = function () {
    bakeSharedTextures(this); kit.loader.show('TERRACE TALES'); kit.loader.progress(.35);
    this.add.image(W / 2, H / 2, 'tt_bg'); makeText(this, W / 2, 336, 'TERRACE\nTALES', 34, '#F7FBFF').setLineSpacing(-5); makeText(this, W / 2, 432, 'HOLLOWBROOK RISE', 13, '#F7C948');
    kit.loader.progress(1); kit.loader.hide();
    var forced = levelIndex(currentProbeValue('forceLevel'));
    if (forced != null) this.scene.start('play', { index: forced, mode: 'forced' }); else this.scene.start('hub', { focusSlot: slotIndex(currentProbeValue('forceSlot')) });
  };

  function StoryScene() { PhaserRef.Scene.call(this, { key: 'story' }); }
  StoryScene.prototype = Object.create(PhaserRef.Scene.prototype); StoryScene.prototype.constructor = StoryScene;
  StoryScene.prototype.create = function (data) {
    Game.active = this; data = data || {}; this.index = clamp(data.index | 0, 0, 14); this.mode = data.mode || 'campaign'; this.beat = STORY_BEATS[this.index]; baseScene(this, 'story', .16);
    kit.audio.music('meta', 300); this.bg = gardenImage(this); this.add.rectangle(W / 2, H / 2, W, H, 0x10182B, .28).setDepth(10);
    this.card = this.add.rectangle(W / 2, 408, 344, 420, 0xFFF8EE, .97).setStrokeStyle(3, ZONES[LEVELS[this.index].zone].accent, .9).setDepth(20);
    this.avatar = this.add.circle(195, 245, 48, ZONES[LEVELS[this.index].zone].accent, 1).setStrokeStyle(4, 0xFFF8EE, .9).setDepth(21);
    this.avatarText = makeText(this, 195, 245, this.beat.sigil, 30, '#FFF8EE').setDepth(22);
    this.character = makeText(this, W / 2, 310, '', 16, '#2B2D42').setDepth(22);
    this.title = makeText(this, W / 2, 350, '', 21, '#182238').setDepth(22);
    this.line = makeText(this, 40, 405, '', 18, '#2B2D42', 0).setWordWrapWidth(310).setLineSpacing(7).setDepth(22);
    this.motif = makeText(this, W / 2, 552, '', 13, '#5D7294').setDepth(22);
    this.stepText = makeText(this, W / 2, 594, '', 12, '#5D7294').setDepth(22);
    this.nextButton = makeButton(this, W / 2, 696, 210, 52, 'CONTINUE', this.advance.bind(this), { fill: 0x4F9D69, stroke: 0x2B2D42, size: 15, depth: 30 });
    this.backButton = makeButton(this, W / 2, 764, 120, 42, 'BACK', function () { this.scene.start('hub'); }.bind(this), { fill: BOARD, stroke: 0x5D7294, size: 13, depth: 30 });
    this.lineIndex = 0; this.renderStory(); publish(this, { mode: 'story', level: this.index + 1, phase: 'dialogue', garden: ZONES[LEVELS[this.index].zone].name });
  };
  StoryScene.prototype.renderStory = function () {
    var lines = this.beat.lines; setTextIfChanged(this.character, this.beat.character + ' · ' + this.beat.role); setTextIfChanged(this.title, this.beat.title); setTextIfChanged(this.line, lines[this.lineIndex]); setTextIfChanged(this.motif, 'Story tile pattern: ' + this.beat.motif); setTextIfChanged(this.stepText, (this.lineIndex + 1) + ' of ' + lines.length); setButtonLabel(this.nextButton, this.lineIndex < lines.length - 1 ? 'NEXT' : 'BEGIN LEVEL');
  };
  StoryScene.prototype.advance = function () {
    if (this.lineIndex < this.beat.lines.length - 1) { this.lineIndex++; this.renderStory(); publish(this, { phase: 'dialogue' }); return; }
    saveData.story[this.index] = 1; saveData.characters[this.beat.unlock] = true; kit.save.set(saveData); this.scene.start('play', { index: this.index, mode: this.mode });
  };
  StoryScene.prototype.update = function (time, delta) { if (pollGlobalKeys(this, true)) return; var self = this; var steps = fixedSteps(this, delta, function () { self.stepFixed(); self.gardenTime = (self.gardenTime + STEP / 42) % 1; }); if (steps) updateGardenTexture(this, null, null, steps * STEP); };
  StoryScene.prototype.shutdown = function () { unwireDraw(this); };

  function HubScene() { PhaserRef.Scene.call(this, { key: 'hub' }); }
  HubScene.prototype = Object.create(PhaserRef.Scene.prototype); HubScene.prototype.constructor = HubScene;
  HubScene.prototype.create = function (data) {
    Game.active = this; this.focusSlot = data && data.focusSlot != null ? data.focusSlot : slotIndex(currentProbeValue('forceSlot')); this.replay = false; baseScene(this, saveData.completed >= 15 ? 'finale-garden' : 'garden', .16);
    if (saveData.pendingChoice >= 0 && saveData.pendingChoice === saveData.completed && saveData.completed < 15) { this.scene.start('choice', { index: saveData.pendingChoice }); return; }
    kit.audio.music('meta', 500);
    this.bg = gardenImage(this); header(this, 'Hollowbrook Rise', saveData.completed >= 15 ? 'Restored garden' : 'Choose the next work');
    this.progress = makeText(this, W - 18, 28, '', 15, '#F7C948', 1).setDepth(22);
    this.subtitle = makeText(this, W / 2, 654, '', 15, '#2B2D42').setDepth(30);
    this.buttons = []; this.legendTexts = []; this.menuTexts = [];
    this.render(); publish(this, { mode: saveData.completed >= 15 ? 'finale-garden' : 'garden', slots: saveData.completed });
  };
  HubScene.prototype.clearButtons = function () { for (var i = 0; i < this.buttons.length; i++) this.buttons[i].destroy(true); this.buttons.length = 0; };
  HubScene.prototype.addButton = function (x, y, w, h, label, fn, opts) { var b = makeButton(this, x, y, w, h, label, fn, opts); this.buttons.push(b); return b; };
  HubScene.prototype.renderPips = function () { for (var i = 0; i < 15; i++) { var x = 18 + (i % 8) * 48, y = 116 + (i / 8 | 0) * 22; var pip = this.add.rectangle(x, y, 34, 8, i < saveData.completed ? 0x5BCB77 : (i === saveData.completed ? 0xF7C948 : 0xFFFFFF), i < saveData.completed ? 1 : (i === saveData.completed ? .9 : .17)).setDepth(22); pip.setStrokeStyle(1, i === this.focusSlot ? 0xF7FBFF : 0x5D7294, i === this.focusSlot ? 1 : .3); this.buttons.push(pip); } };
  HubScene.prototype.clearLegend = function () { for (var i = 0; i < this.legendTexts.length; i++) this.legendTexts[i].destroy(); this.legendTexts.length = 0; };
  HubScene.prototype.clearMenuText = function () { for (var i = 0; i < this.menuTexts.length; i++) this.menuTexts[i].destroy(); this.menuTexts.length = 0; };
  HubScene.prototype.render = function () {
    var self = this; this.clearButtons(); this.clearLegend(); this.clearMenuText(); this.renderPips(); setTextIfChanged(this.progress, saveData.completed + ' / 15');
    if (this.replay) { this.renderReplay(); return; }
    var zone = ZONES[Math.min(3, saveData.completed / 4 | 0)]; setTextIfChanged(this.subtitle, saveData.completed >= 15 ? 'Daylight, dusk, and the lantern hour are yours.' : zone.name + '  ·  ' + zone.short); setColorIfChanged(this.subtitle, '#2B2D42');
    if (saveData.completed < 15) {
      var slot = SLOTS[saveData.completed]; this.addButton(W / 2, 716, 250, 54, 'PLAY LEVEL ' + String(saveData.completed + 1).padStart(2, '0'), function () { self.startLevel(saveData.completed, false); }, { fill: 0x4F9D69, stroke: 0xF7FBFF, size: 17, sub: slot.name });
      this.addButton(86, 786, 120, 46, 'REPLAY', function () { self.replay = true; self.render(); }, { fill: BOARD, stroke: 0x9A7CF3, size: 14 });
      this.addButton(304, 786, 120, 46, 'SETTINGS', function () { kit.openSettings(); }, { fill: BOARD, stroke: 0x5D7294, size: 14 });
    } else {
      this.addButton(W / 2, 716, 250, 54, 'REPLAY A LEVEL', function () { self.replay = true; self.render(); }, { fill: 0x4F9D69, stroke: 0xF7FBFF, size: 17, sub: 'PERSONAL BESTS' });
      this.addButton(86, 786, 120, 46, 'SETTINGS', function () { kit.openSettings(); }, { fill: BOARD, stroke: 0x5D7294, size: 14 });
      this.addButton(304, 786, 120, 46, 'NEW RISE', function () { self.showResetConfirm(); }, { fill: 0x633F4B, stroke: 0xEC6B62, size: 14 });
    }
    this.renderMedalLegend(); publish(this, { mode: saveData.completed >= 15 ? 'finale-garden' : 'garden', slots: saveData.completed });
  };
  HubScene.prototype.showResetConfirm = function () {
    if (this.confirmUi) return;
    this.confirmUi = []; this.confirmUi.push(this.add.rectangle(W / 2, 430, 328, 220, 0x10182B, .98).setStrokeStyle(2, 0xEC6B62, .95).setDepth(70)); this.confirmUi.push(makeText(this, W / 2, 362, 'Start a new rise?', 23, '#F7FBFF').setDepth(71)); this.confirmUi.push(makeText(this, W / 2, 406, 'This clears your restored garden and medals.', 14, '#D7E0F0').setDepth(71)); this.confirmUi.push(makeText(this, W / 2, 432, 'The action cannot be undone.', 14, '#D7E0F0').setDepth(71)); this.confirmUi.push(makeButton(this, 122, 505, 112, 46, 'KEEP IT', this.closeResetConfirm.bind(this), { fill: BOARD, stroke: 0x5D7294, size: 13, depth: 72 })); this.confirmUi.push(makeButton(this, 268, 505, 112, 46, 'NEW RISE', this.confirmReset.bind(this), { fill: 0x633F4B, stroke: 0xEC6B62, size: 13, depth: 72 }));
  };
  HubScene.prototype.closeResetConfirm = function () { if (!this.confirmUi) return; for (var i = 0; i < this.confirmUi.length; i++) this.confirmUi[i].destroy(true); this.confirmUi = null; };
  HubScene.prototype.confirmReset = function () { this.closeResetConfirm(); resetGarden(); };
  HubScene.prototype.renderMedalLegend = function () { var text = saveData.completed >= 15 ? 'The rise keeps moving through its own day and night.' : 'Every clear funds one permanent garden choice.'; this.legendTexts.push(makeText(this, W / 2, 670, text, 14, '#2B2D42').setDepth(30)); for (var i = 0; i < 15; i++) { var medal = Number(saveData.medals[String(i)] || 0); if (medal) { var x = 32 + (i % 8) * 48, y = 130 + (i / 8 | 0) * 22; this.legendTexts.push(makeText(this, x, y, medalGlyph(medal), 13, medal >= 3 ? '#A86F4C' : medal === 2 ? '#D7E0F0' : '#F29A4A').setDepth(31)); } } };
  HubScene.prototype.renderReplay = function () { var self = this; this.menuTexts.push(makeText(this, W / 2, 158, 'Replay any restored level', 20, '#2B2D42').setDepth(30)); this.menuTexts.push(makeText(this, W / 2, 185, 'Beat your personal best. No gates, no cost.', 14, '#2B2D42').setDepth(30)); for (var i = 0; i < saveData.completed; i++) { var x = 44 + (i % 4) * 100, y = 246 + (i / 4 | 0) * 62, medal = Number(saveData.medals[String(i)] || 0), b = this.addButton(x, y, 82, 46, String(i + 1).padStart(2, '0') + '  ' + (medal ? medalGlyph(medal) : '○'), (function (idx) { return function () { self.startLevel(idx, true); }; })(i), { fill: 0x243453, stroke: medal >= 3 ? 0xF7C948 : 0x5D7294, size: 14 }); }
    this.addButton(W / 2, 788, 128, 46, 'BACK', function () { self.replay = false; self.render(); }, { fill: BOARD, stroke: 0x5D7294, size: 14 }); publish(this, { mode: 'replay-select', slots: saveData.completed }); };
  HubScene.prototype.startLevel = function (index, replay) { var forced = levelIndex(currentProbeValue('forceLevel')), nextIndex = forced == null ? index : forced, mode = replay ? 'replay' : 'campaign'; this.scene.start(replay ? 'play' : 'story', { index: nextIndex, mode: mode }); };
  HubScene.prototype.update = function (time, delta) { if (pollGlobalKeys(this, false)) return; if (this.confirmUi && this.keyPressed('Escape')) { this.closeResetConfirm(); return; } var self = this; var steps = fixedSteps(this, delta, function () { self.stepFixed(); self.gardenTime = (self.gardenTime + STEP / 42) % 1; }); if (steps && this.bg && this.textures.exists('tt_garden')) updateGardenTexture(this, null, null, steps * STEP); };
  HubScene.prototype.shutdown = function () { unwireDraw(this); };

  function PlayScene() { PhaserRef.Scene.call(this, { key: 'play' }); }
  PlayScene.prototype = Object.create(PhaserRef.Scene.prototype); PlayScene.prototype.constructor = PlayScene;
  PlayScene.prototype.create = function (args) {
    Game.active = this; args = args || {}; this.index = clamp(args.index | 0, 0, 14); this.spec = LEVELS[this.index] || LEVELS[0]; this.mode = args.mode === 'replay' ? 'replay' : (args.mode === 'forced' ? 'forced' : 'campaign'); baseScene(this, this.mode, .16);
    this.moves = this.spec.moves + this.spec.bonusMoves; this.score = 0; this.streak = 0; this.bestStreak = 0; this.hintUsed = false; this.hintActive = false; this.phase = 'idle'; this.phaseT = 0; this.result = null; this.selection = null; this.preview = null; this.touch = null; this.keyboardCursor = { x: 0, y: 0 }; this.keyboardAnchor = null; this.toast = ''; this.toastT = 0; this.goalPingT = 0; this.goalPingGoal = -1; this.hintT = 0; this.lastGoalTotal = 0; this.cascade = 0; this.shakeX = 0; this.shakeY = 0; this.board = new MatchBoard(this.spec); this.goals = this.spec.goals.map(function (g) { return { color: g.color, need: g.need, got: 0 }; });
    this.view = []; this.fallFrom = []; this.cleared = Object.create(null); this.clearTypes = Object.create(null); this.swapIndices = null; this.pendingInfo = null;
    this.add.image(W / 2, H / 2, 'tt_bg').setDepth(0); this.boardChrome = this.add.image(W / 2, H / 2, 'tt_board_chrome').setDepth(1); this.buildFx();
    this.buildHud(); this.buildTiles(); this.bindInput(); this.draw = this.render.bind(this); wireDraw(this); this.render(); publish(this, { mode: this.mode === 'replay' ? 'replay' : 'play', level: this.index + 1, moves: this.moves, garden: ZONES[this.spec.zone].name, phase: 'level-start', storyBeat: this.index }); kit.audio.music('board', 500); this.startBanner = .9;
  };
  PlayScene.prototype.buildFx = function () {
    this.clearFx = this.add.particles ? this.add.particles('tt_dust', { x: 0, y: 0, quantity: 3, lifespan: 340, speed: { min: 28, max: 72 }, gravityY: 160, scale: { start: .9, end: .1 }, emitting: false }).setDepth(22) : null;
    this.cascadeFx = this.add.particles ? this.add.particles('tt_spark', { x: 0, y: 0, quantity: 4, lifespan: 460, speed: { min: 55, max: 130 }, gravityY: 220, scale: { start: .8, end: .05 }, emitting: false }).setDepth(22) : null;
    this.rewardFx = this.add.particles ? this.add.particles('tt_spark', { x: 0, y: 0, quantity: 24, lifespan: 900, speed: { min: 100, max: 240 }, gravityY: 180, scale: { start: 1.1, end: .05 }, emitting: false }).setDepth(53) : null;
  };
  PlayScene.prototype.buildHud = function () {
    this.levelText = makeText(this, 20, 22, 'LEVEL ' + String(this.index + 1).padStart(2, '0'), 17, '#F7FBFF', 0).setDepth(24); this.zoneText = makeText(this, 20, 49, ZONES[this.spec.zone].name, 14, '#D7E0F0', 0).setDepth(24); this.titleText = makeText(this, 20, 75, this.spec.title, 12, '#F7C948', 0).setDepth(24); this.movesText = makeText(this, 366, 22, '', 25, '#F7C948', 1).setDepth(24); this.scoreText = makeText(this, 366, 53, '', 14, '#D7E0F0', 1).setDepth(24);
    this.goalText = []; this.goalIcons = []; this.goalBadges = []; for (var i = 0; i < 3; i++) { this.goalBadges[i] = this.add.circle(47 + i * 126, 116, 20, 0x182238, .8).setStrokeStyle(1, 0x5D7294, .65).setDepth(23); this.goalIcons[i] = makeText(this, 24 + i * 126, 115, '', 21, '#F7FBFF').setDepth(24); this.goalText[i] = makeText(this, 47 + i * 126, 116, '', 14, '#F7FBFF', 0).setDepth(24); }
    this.coachBg = this.add.rectangle(W / 2, 205, 356, 30, 0x182238, .82).setDepth(24); this.coachText = makeText(this, W / 2, 205, '', 14, '#D7E0F0').setDepth(25); this.coachT = this.index === 0 && this.mode === 'campaign' ? 3.2 : 0;
    this.chipBg = this.add.image(300, 151, 'tt_chip').setDisplaySize(154, 30).setDepth(27).setVisible(false); this.chipText = makeText(this, 300, 151, '', 14, '#F7FBFF').setDepth(28).setVisible(false); this.nextBg = this.add.rectangle(340, 178, 70, 43, 0x182238, .9).setStrokeStyle(1, 0x5D7294, .85).setDepth(24); this.nextLabel = makeText(this, 340, 159, 'NEXT', 9, '#D7E0F0').setDepth(25); this.nextGem = this.add.image(340, 183, 'tt_gem_0_0').setDisplaySize(34, 34).setDepth(25);
    this.stateText = makeText(this, 20, 218, '', 10, '#F7C948', 0).setDepth(25);
    this.resultBg = this.add.rectangle(W / 2, 430, 328, 226, 0x10182B, .97).setStrokeStyle(2, 0xF7C948, .95).setDepth(50).setVisible(false); this.resultTitle = makeText(this, W / 2, 346, '', 25, '#F7FBFF').setDepth(51).setVisible(false); this.resultDetail = makeText(this, W / 2, 390, '', 15, '#D7E0F0').setDepth(51).setVisible(false); this.resultMedal = makeText(this, W / 2, 445, '', 38, '#F7C948').setDepth(51).setVisible(false); this.resultButton = makeButton(this, W / 2, 540, 236, 50, '', this.continueFromResult.bind(this), { fill: 0x4F9D69, stroke: 0xF7FBFF, size: 16, depth: 52 });
  };
  PlayScene.prototype.buildTiles = function () { this.tiles = []; for (var i = 0; i < 64; i++) { var tile = this.add.image(0, 0, 'tt_gem_0_0').setDepth(8).setVisible(true); this.tiles.push(tile); this.view.push({ x: 0, y: 0, scale: 1, alpha: 1, type: 0, special: 0 }); this.fallFrom.push(0); } this.storyMarks = this.board.storyCells.map(function (cell) { return this.add.image(0, 0, 'tt_story_mark').setDepth(7).setVisible(true); }, this); this.selector = this.add.image(0, 0, 'tt_selector').setDepth(12).setVisible(false); this.ghost = this.add.image(0, 0, 'tt_ghost').setDepth(11).setVisible(false); this.arrow = this.add.image(0, 0, 'tt_arrow').setDepth(11).setVisible(false); };
  PlayScene.prototype.bindInput = function () {
    var self = this;
    this.input.on('pointerdown', function (pointer) {
      claimPointer(pointer, 'board');
      if (self.touch || self.result || self.phase !== 'idle' || self.startBanner > 0) return;
      var c = self.boardCell(pointer.worldX, pointer.worldY);
      if (c) { self.keyboardAnchor = null; self.touch = { id: pointer.id, start: c, sx: pointer.worldX, sy: pointer.worldY, previousSelection: self.selection ? { x: self.selection.x, y: self.selection.y } : null }; self.preview = null; }
    });
    this.input.on('pointermove', function (pointer) {
      if (!self.touch || self.touch.id !== pointer.id || self.result || self.phase !== 'idle') return;
      var c = self.boardCell(pointer.worldX, pointer.worldY);
      self.preview = c && (Math.abs(c.x - self.touch.start.x) + Math.abs(c.y - self.touch.start.y) === 1) ? c : null;
    });
    function release(pointer, cancelled) {
      if (!self.touch || self.touch.id !== pointer.id) return;
      var touch = self.touch; self.touch = null; self.preview = null;
      if (cancelled) return;
      var dx = pointer.worldX - touch.sx, dy = pointer.worldY - touch.sy, end = self.boardCell(pointer.worldX, pointer.worldY);
      if (Math.max(Math.abs(dx), Math.abs(dy)) > 14) end = Math.abs(dx) > Math.abs(dy) ? { x: touch.start.x + (dx > 0 ? 1 : -1), y: touch.start.y } : { x: touch.start.x, y: touch.start.y + (dy > 0 ? 1 : -1) };
      if (end && Math.abs(end.x - touch.start.x) + Math.abs(end.y - touch.start.y) === 1) self.trySwap(touch.start, end); else self.tapCell(touch.start);
    }
    this.input.on('pointerup', function (pointer) { release(pointer, false); });
    this.input.on('pointerupoutside', function (pointer) { release(pointer, true); });
    this.input.on('pointercancel', function (pointer) { release(pointer, true); });
  };
  PlayScene.prototype.boardCell = function (x, y) { if (x < BOARD_X || y < BOARD_Y || x >= BOARD_X + COLS * CELL || y >= BOARD_Y + ROWS * CELL) return null; return { x: clamp(Math.floor((x - BOARD_X) / CELL), 0, 7), y: clamp(Math.floor((y - BOARD_Y) / CELL), 0, 7) }; };
  PlayScene.prototype.cellPos = function (c) { return { x: BOARD_X + c.x * CELL + CELL / 2, y: BOARD_Y + c.y * CELL + CELL / 2 }; };
  PlayScene.prototype.syncKeyboardCursor = function (cell) { if (cell) this.keyboardCursor = { x: clamp(cell.x, 0, 7), y: clamp(cell.y, 0, 7) }; };
  PlayScene.prototype.tapCell = function (cell) { if (!cell || this.result || this.phase !== 'idle' || this.startBanner > 0) return; this.keyboardAnchor = null; this.hintActive = false; this.syncKeyboardCursor(cell); if (this.selection && Math.abs(this.selection.x - cell.x) + Math.abs(this.selection.y - cell.y) === 1) this.trySwap(this.selection, cell); else { this.selection = { x: cell.x, y: cell.y }; kit.audio.sfx('ui', { volume: .22 }); } };
  PlayScene.prototype.trySwap = function (a, b) { if (this.phase !== 'idle' || this.result || this.startBanner > 0 || !this.board.at(b.x, b.y)) return; this.syncKeyboardCursor(b); if (!this.board.testSwap(a, b)) { this.sayChip('Try a match', '#EC6B62'); this.selection = { x: a.x, y: a.y }; kit.audio.sfx('invalid', { volume: .3 }); return; } this.board.swap(a, b); this.moves--; this.swapIndices = [this.board.index(a.x, a.y), this.board.index(b.x, b.y)]; var left = this.board.cells[this.swapIndices[0]], right = this.board.cells[this.swapIndices[1]]; if (left && left.special === SPECIAL.PRISM) { left.type = right ? right.type : left.type; this.pendingInfo = { clear: [this.swapIndices[0]], specials: [] }; } else if (right && right.special === SPECIAL.PRISM) { right.type = left ? left.type : right.type; this.pendingInfo = { clear: [this.swapIndices[1]], specials: [] }; } else this.pendingInfo = this.board.matchInfo(this.swapIndices[1]) || { clear: [], specials: [] }; this.phase = 'swap'; this.phaseT = 0; this.cascade = 0; this.selection = { x: b.x, y: b.y }; this.hintT = 0; this.preview = null; kit.audio.sfx('swap', { volume: .55 }); publish(this, { mode: this.mode === 'replay' ? 'replay' : 'play', level: this.index + 1, moves: this.moves, phase: 'resolve' }); };
  PlayScene.prototype.resolveNow = function () { var outcome = this.board.resolve(this.pendingInfo); this.cascade++; var gain = 0, total = 0, self = this, goalHit = -1; for (var i = 0; i < outcome.removed.length; i++) { var item = outcome.removed[i]; this.cleared[item.index] = true; this.clearTypes[item.index] = item.type; total++; gain += 10 * Math.min(6, this.cascade); for (var gi = 0; gi < this.goals.length; gi++) if (this.goals[gi].color === item.type) { this.goals[gi].got++; goalHit = gi; break; } this.burstAt(item.index, item.type, this.cascade > 1 ? 'cascade' : 'pop'); }
    this.score += gain; this.streak = Math.max(this.streak, this.cascade); this.bestStreak = Math.max(this.bestStreak, this.cascade); if (goalHit >= 0) { this.goalPingGoal = goalHit; this.goalPingT = .6; } if (total) kit.audio.sfx(this.cascade > 1 ? 'cascade' : 'match', { volume: .7 }); if (outcome.triggered) { kit.audio.sfx('special', { volume: .7 }); kit.juice.shake(4, 100); } else if (this.cascade > 2) kit.juice.shake(2, 70); if (this.cascade > 1) this.sayChip(this.cascade + ' cascade', '#F7C948'); this.phase = 'clear'; this.phaseT = 0; this.lastGoalTotal = this.goals.reduce(function (n, g) { return n + g.got; }, 0); this.pendingInfo = null; publish(this, { moves: this.moves, phase: 'clear' }); };
  PlayScene.prototype.finishClear = function () { this.fallFrom = this.board.collapse(); this.cleared = Object.create(null); this.clearTypes = Object.create(null); this.phase = 'fall'; this.phaseT = 0; kit.audio.sfx('fall', { volume: .3 }); };
  PlayScene.prototype.finishFall = function () { for (var i = 0; i < this.fallFrom.length; i++) this.fallFrom[i] = 0; var info = this.board.matchInfo(); if (info) { this.pendingInfo = info; this.phase = 'clear-next'; this.phaseT = 0; } else { this.phase = 'idle'; this.selection = null; this.afterTurn(); } };
  PlayScene.prototype.afterTurn = function () { var won = this.goals.every(function (g) { return g.got >= g.need; }); if (won) { this.win(); return; } if (this.moves <= 0) { this.lose(); return; } if (!this.board.hasMove()) { this.board.shuffle(); this.sayChip('Fresh board', '#5DB7D8'); } publish(this, { moves: this.moves, phase: 'ready' }); };
  function gamepadSnapshot() {
    var input = kit && kit.input, state = null;
    if (input && typeof input.gamepadState === 'function') state = input.gamepadState();
    else if (input && typeof input.getGamepadState === 'function') state = input.getGamepadState();
    if (!state) return Object.create(null);
    var buttons = state.buttons || [], axes = state.axes || [], named = function (key, index) { return !!(state[key] || buttons[key] || buttons[index] === true || (buttons[index] && buttons[index].pressed)); };
    return { left: named('left', 14) || named('dpadLeft', 14) || axes[0] < -.6, right: named('right', 15) || named('dpadRight', 15) || axes[0] > .6, up: named('up', 12) || named('dpadUp', 12) || axes[1] < -.6, down: named('down', 13) || named('dpadDown', 13) || axes[1] > .6, confirm: named('confirm', 0) || named('a', 0), cancel: named('cancel', 1) || named('b', 1), restart: named('restart', 3) || named('y', 3), start: named('start', 9) };
  }
  function gamepadEdges() {
    var now = gamepadSnapshot(), previous = root.__tt._gamepadState || Object.create(null), edges = Object.create(null);
    Object.keys(now).forEach(function (key) { edges[key] = !!now[key] && previous[key] !== true; }); root.__tt._gamepadState = now; return edges;
  }
  PlayScene.prototype.handleKeyboard = function () {
    var pad = gamepadEdges(), left = this.keyPressed('ArrowLeft') || pad.left, right = this.keyPressed('ArrowRight') || pad.right, up = this.keyPressed('ArrowUp') || pad.up, down = this.keyPressed('ArrowDown') || pad.down;
    var pick = this.keyPressed('Enter') || this.keyPressed('Space') || pad.confirm;
    if (pad.start) { kit.openSettings(); return; }
    if (this.result) { if (pick) this.continueFromResult(); else if (pad.cancel) this.toGarden(); return; }
    if (pad.restart) { kit.restart(); return; }
    if (this.phase !== 'idle' || this.startBanner > 0) return;
    if (left) this.moveKeyboard(-1, 0); else if (right) this.moveKeyboard(1, 0); else if (up) this.moveKeyboard(0, -1); else if (down) this.moveKeyboard(0, 1);
    if (pick) this.pickKeyboard();
  };
  PlayScene.prototype.moveKeyboard = function (dx, dy) {
    var cursor = this.keyboardCursor, x = clamp(cursor.x + dx, 0, 7), y = clamp(cursor.y + dy, 0, 7);
    if (x === cursor.x && y === cursor.y) return;
    cursor.x = x; cursor.y = y;
    var next = { x: x, y: y };
    if (this.keyboardAnchor && Math.abs(next.x - this.keyboardAnchor.x) + Math.abs(next.y - this.keyboardAnchor.y) === 1) { this.trySwap(this.keyboardAnchor, next); if (this.phase === 'swap') this.keyboardAnchor = null; }
    else { this.hintActive = false; this.selection = next; this.preview = null; }
  };
  PlayScene.prototype.pickKeyboard = function () {
    var cursor = this.keyboardCursor;
    if (this.keyboardAnchor && Math.abs(cursor.x - this.keyboardAnchor.x) + Math.abs(cursor.y - this.keyboardAnchor.y) === 1) { this.trySwap(this.keyboardAnchor, { x: cursor.x, y: cursor.y }); if (this.phase === 'swap') this.keyboardAnchor = null; return; }
    this.hintActive = false; this.keyboardAnchor = { x: cursor.x, y: cursor.y }; this.selection = { x: cursor.x, y: cursor.y }; this.preview = null; this.sayChip('Choose a neighbour', '#F7C948'); kit.audio.sfx('ui', { volume: .22 });
  };
  PlayScene.prototype.stepPlay = function () { this.handleKeyboard(); if (this.startBanner > 0) { this.startBanner = Math.max(0, this.startBanner - STEP); return; } if (this.toastT > 0) this.toastT = Math.max(0, this.toastT - STEP); if (this.goalPingT > 0) this.goalPingT = Math.max(0, this.goalPingT - STEP); if (this.hintT > 0) this.hintT = Math.max(0, this.hintT - STEP); else if (this.hintActive) { this.hintActive = false; this.preview = null; this.selection = null; } if (this.coachT > 0) this.coachT = Math.max(0, this.coachT - STEP); if (this.phase === 'idle' || this.result) return; this.phaseT += STEP; if (this.phase === 'swap' && this.phaseT >= .14) this.resolveNow(); else if ((this.phase === 'clear' || this.phase === 'clear-next') && this.phaseT >= .14) { if (this.phase === 'clear-next') this.resolveNow(); else this.finishClear(); } else if (this.phase === 'fall' && this.phaseT >= .22) this.finishFall(); };
  PlayScene.prototype.update = function (time, delta) { if (this.touch && (!kit.input.pointers || !kit.input.pointers.has(this.touch.id))) { this.touch = null; this.preview = null; } if (this.keyPressed('KeyM')) toggleMute(); if (this.keyPressed('KeyR')) { kit.restart(); return; } if (this.keyPressed('Escape')) { this.toGarden(); return; } var self = this; var steps = fixedSteps(this, delta, function () { self.stepFixed(); self.stepPlay(); self.updateParticles(); }); if (steps) publish(this, { moves: self.moves, phase: self.result ? self.result : self.phase }); };
  PlayScene.prototype.sayChip = function (text, color) { this.toast = text; this.toastColor = color || '#F7FBFF'; this.toastT = motionOn() ? 1 : .8; };
  PlayScene.prototype.burstAt = function (idx, type, kind) { if (!motionOn()) return; var p = this.cellPos({ x: idx % 8, y: idx / 8 | 0 }), emitter = kind === 'cascade' ? this.cascadeFx : this.clearFx; if (emitter && emitter.explode) emitter.explode(kind === 'cascade' ? 4 : 3, p.x + this.shakeX, p.y + this.shakeY); };
  PlayScene.prototype.updateParticles = function () {};
  PlayScene.prototype.showHint = function () { if (this.phase !== 'idle' || this.result) return; this.hintUsed = true; for (var y = 0; y < 8; y++) for (var x = 0; x < 8; x++) { var a = { x: x, y: y }; if (x < 7 && this.board.testSwap(a, { x: x + 1, y: y })) { this.selection = a; this.syncKeyboardCursor(a); this.preview = { x: x + 1, y: y }; this.hintT = 1.2; this.hintActive = true; this.sayChip('A legal swap', '#F7C948'); return; } if (y < 7 && this.board.testSwap(a, { x: x, y: y + 1 })) { this.selection = a; this.syncKeyboardCursor(a); this.preview = { x: x, y: y + 1 }; this.hintT = 1.2; this.hintActive = true; this.sayChip('A legal swap', '#F7C948'); return; } } };
  PlayScene.prototype.win = function () { this.result = 'win'; this.phase = 'result'; var remaining = this.moves, medal = medalFor(this.spec, remaining, this.bestStreak, this.hintUsed), key = String(this.index); if (this.mode === 'campaign' && this.index === saveData.completed) saveData.pendingChoice = this.index; saveData.best[key] = Math.max(Number(saveData.best[key] || 0), this.score + remaining * 30); saveData.medals[key] = Math.max(Number(saveData.medals[key] || 0), medal); saveData.streaks[key] = Math.max(Number(saveData.streaks[key] || 0), this.bestStreak); kit.save.set(saveData); kit.audio.sfx('goal', { volume: .85 }); kit.audio.sfx('reveal', { volume: .75 }); duckMusic(); if (motionOn() && this.rewardFx && this.rewardFx.explode) this.rewardFx.explode(24, W / 2 + this.shakeX, 430 + this.shakeY); setTextIfChanged(this.resultTitle, this.mode === 'replay' ? 'Personal best run' : (this.mode === 'forced' ? 'Level clear' : 'Garden funded')); setTextIfChanged(this.resultDetail, 'Score ' + (this.score + remaining * 30) + '  ·  ' + remaining + ' moves left'); setTextIfChanged(this.resultMedal, medalGlyph(medal) + '  ' + (medal >= 3 ? 'GOLD' : medal === 2 ? 'SILVER' : 'BRONZE')); setButtonLabel(this.resultButton, this.mode === 'replay' || this.mode === 'forced' ? 'Return to garden' : (this.index >= 14 ? 'Restore the finale' : 'Choose the renovation')); this.resultMedal.setColor(medal >= 3 ? '#F7C948' : medal === 2 ? '#D7E0F0' : '#F29A4A'); publish(this, { mode: this.mode === 'replay' ? 'replay' : (this.mode === 'forced' ? 'forced' : 'play'), level: this.index + 1, moves: remaining, phase: 'win', medal: medal, pendingChoice: saveData.pendingChoice }); };
  PlayScene.prototype.lose = function () { this.result = 'lose'; this.phase = 'result'; kit.audio.sfx('fail', { volume: .6 }); setTextIfChanged(this.resultTitle, 'Out of moves'); setTextIfChanged(this.resultDetail, 'No penalty. Try the level again.'); setTextIfChanged(this.resultMedal, '↺'); setButtonLabel(this.resultButton, 'Retry level'); publish(this, { phase: 'lose' }); };
  PlayScene.prototype.continueFromResult = function () { if (this.result === 'lose') { kit.restart(); return; } if (this.mode === 'replay' || this.mode === 'forced') { this.scene.start('hub'); return; } this.scene.start('choice', { index: this.index }); };
  PlayScene.prototype.render = function () { var i, c, pos, view, cell, t, y, x, juice = kit && kit.juice && kit.juice.frame ? kit.juice.frame() : { dx: 0, dy: 0 }, resolving = this.phase === 'swap' || this.phase === 'clear' || this.phase === 'clear-next' || this.phase === 'fall'; this.shakeX = motionOn() ? clamp(juice.dx || 0, -4, 4) : 0; this.shakeY = motionOn() ? clamp(juice.dy || 0, -4, 4) : 0; if (this.boardChrome) this.boardChrome.setPosition(W / 2 + this.shakeX, H / 2 + this.shakeY); setTextIfChanged(this.movesText, this.moves); setColorIfChanged(this.movesText, this.moves <= 5 ? '#EC6B62' : '#F7C948'); setTextIfChanged(this.scoreText, '★ ' + this.score); this.nextGem.setTexture('tt_gem_' + this.board.peekType() + '_0'); for (i = 0; i < 3; i++) { if (this.goals[i]) { setTextIfChanged(this.goalIcons[i], SYMBOL_GLYPHS[this.goals[i].color]); setColorIfChanged(this.goalIcons[i], goalColor(this.goals[i].color)); setTextIfChanged(this.goalText[i], Math.min(this.goals[i].got, this.goals[i].need) + '/' + this.goals[i].need); } else { setTextIfChanged(this.goalIcons[i], ''); setTextIfChanged(this.goalText[i], ''); } var ping = this.goalPingGoal === i && this.goalPingT > 0; this.goalBadges[i].setScale(ping && motionOn() ? 1 + Math.sin(this.goalPingT * 18) * .12 : 1).setStrokeStyle(ping ? 2 : 1, ping ? 0xF7C948 : 0x5D7294, ping ? 1 : .65); }
    var ready = this.phase === 'idle' && !this.result; var coachVisible = this.coachT > 0 && this.toastT <= 0 && this.startBanner <= 0 && !this.result; setTextIfChanged(this.stateText, (this.result ? 'RESULT' : (resolving ? 'RESOLVE' : 'READY')) + '  ·  ' + STORY_BEATS[this.index].motif); setColorIfChanged(this.stateText, resolving ? '#EC6B62' : '#F7C948'); setTextIfChanged(this.coachText, coachVisible ? 'Swipe or tap two neighbours to swap.' : ''); this.coachBg.setVisible(coachVisible); this.coachText.setVisible(coachVisible); this.chipBg.setVisible(this.toastT > 0); this.chipText.setVisible(this.toastT > 0); if (this.toastT > 0) { setTextIfChanged(this.chipText, this.toast); setColorIfChanged(this.chipText, this.toastColor || '#F7FBFF'); }
    if (!this.startPanel) { this.startPanel = this.add.rectangle(W / 2, 430, 270, 86, 0x182238, .94).setStrokeStyle(2, 0xF7C948, .9).setDepth(47); this.startLabel = makeText(this, W / 2, 416, '', 21, '#F7FBFF').setDepth(48); this.startSub = makeText(this, W / 2, 451, '', 14, '#D7E0F0').setDepth(48); }
    var startVisible = this.startBanner > 0 && !this.result; this.startPanel.setVisible(startVisible); this.startLabel.setVisible(startVisible); this.startSub.setVisible(startVisible); if (startVisible) { setTextIfChanged(this.startLabel, this.mode === 'replay' ? 'Replay level ' + (this.index + 1) : this.spec.title); setTextIfChanged(this.startSub, 'Level ' + (this.index + 1) + '  ·  ' + ZONES[this.spec.zone].name); }
    for (i = 0; i < 64; i++) { cell = this.board.cells[i]; x = i % 8; y = i / 8 | 0; view = this.view[i]; var renderType = cell ? cell.type : (this.clearTypes[i] == null ? 0 : this.clearTypes[i]), renderSpecial = cell ? cell.special : 0, springFall = springProgress(clamp(this.phaseT / .22, 0, 1)), idleY = ready && motionOn() && cell ? Math.sin(this.clock * 2.4 + i * .7) * .65 : 0; var offX = 0, offY = this.fallFrom[i] ? this.fallFrom[i] * CELL * (1 - springFall) : 0;
      if (this.phase === 'swap' && this.swapIndices) { if (i === this.swapIndices[0]) offX = CELL * (1 - springProgress(clamp(this.phaseT / .14, 0, 1))); if (i === this.swapIndices[1]) offX = -CELL * (1 - springProgress(clamp(this.phaseT / .14, 0, 1))); }
      var scale = 1; if (this.cleared[i]) scale = Math.max(.04, 1 - easeOut(clamp(this.phaseT / .14, 0, 1))); if (this.phase === 'swap') scale = 1; if (!cell && !this.cleared[i]) { this.tiles[i].setVisible(false); continue; }
      this.tiles[i].setTexture('tt_gem_' + renderType + '_' + renderSpecial).setPosition(BOARD_X + x * CELL + CELL / 2 + offX + this.shakeX, BOARD_Y + y * CELL + CELL / 2 + offY + idleY + this.shakeY).setScale(scale).setAlpha(cell ? 1 : 1 - easeOut(clamp(this.phaseT / .14, 0, 1))).setVisible(true); view.type = renderType; view.special = renderSpecial;
    }
    for (i = 0; i < this.storyMarks.length; i++) { var mark = this.storyMarks[i], storyCell = this.board.storyCells[i]; mark.setPosition(BOARD_X + storyCell[0] * CELL + CELL / 2 + this.shakeX, BOARD_Y + storyCell[1] * CELL + CELL / 2 + this.shakeY).setAlpha(ready || resolving ? 1 : .45); }
    var sel = this.selection, preview = this.preview, markerVisible = !!sel && (ready || resolving); this.selector.setVisible(markerVisible).setPosition(sel ? BOARD_X + sel.x * CELL + CELL / 2 + this.shakeX : 0, sel ? BOARD_Y + sel.y * CELL + CELL / 2 + this.shakeY : 0).setScale(resolving ? .92 : (motionOn() ? 1 + Math.sin(this.clock * 5) * .025 : 1)).setAlpha(resolving ? .72 : 1); var showPreview = !!preview && ready; this.ghost.setVisible(showPreview).setPosition(showPreview ? BOARD_X + preview.x * CELL + CELL / 2 + this.shakeX : 0, showPreview ? BOARD_Y + preview.y * CELL + CELL / 2 + this.shakeY : 0); this.arrow.setVisible(showPreview).setPosition(showPreview ? BOARD_X + (sel.x + preview.x) * CELL / 2 + CELL / 2 + this.shakeX : 0, showPreview ? BOARD_Y + (sel.y + preview.y) * CELL / 2 + CELL / 2 + this.shakeY : 0).setAngle(preview && sel && preview.x !== sel.x ? (preview.x > sel.x ? 0 : 180) : (preview && sel && preview.y > sel.y ? 90 : -90));
    if (this.result) { this.resultBg.setVisible(true); this.resultTitle.setVisible(true); this.resultDetail.setVisible(true); this.resultMedal.setVisible(true); this.resultButton.setVisible(true); } else { this.resultBg.setVisible(false); this.resultTitle.setVisible(false); this.resultDetail.setVisible(false); this.resultMedal.setVisible(false); this.resultButton.setVisible(false); }
    if (!this.retryButton) { this.retryButton = makeButton(this, 55, 786, 88, 46, '↺', function () { kit.restart(); }, { fill: BOARD, stroke: 0x5D7294, size: 22, icon: '↺', depth: 40 }); this.gardenButton = makeButton(this, 153, 786, 88, 46, '⌂', this.toGarden.bind(this), { fill: BOARD, stroke: 0x5D7294, size: 22, icon: '⌂', depth: 40 }); this.hintButton = makeButton(this, 251, 786, 58, 46, '?', this.showHint.bind(this), { fill: BOARD, stroke: 0xF7C948, size: 20, icon: '?', depth: 40 }); this.soundButton = makeButton(this, 317, 786, 58, 46, '♪', toggleMute, { fill: BOARD, stroke: 0x5D7294, size: 20, icon: '♪', depth: 40 }); }
    this.retryButton.setVisible(!this.result); this.gardenButton.setVisible(!this.result); this.hintButton.setVisible(!this.result); this.soundButton.setVisible(!this.result);
  };
  PlayScene.prototype.toGarden = function () { this.scene.start('hub'); };
  PlayScene.prototype.shutdown = function () { unwireDraw(this); };

  function ChoiceScene() { PhaserRef.Scene.call(this, { key: 'choice' }); }
  ChoiceScene.prototype = Object.create(PhaserRef.Scene.prototype); ChoiceScene.prototype.constructor = ChoiceScene;
  ChoiceScene.prototype.create = function (data) { Game.active = this; this.index = clamp(data && data.index != null ? data.index : saveData.completed, 0, 14); if (saveData.pendingChoice !== this.index) { this.scene.start('hub'); return; } this.slot = SLOTS[this.index]; baseScene(this, 'choice', .2); kit.audio.music('meta', 300); this.bg = gardenImage(this); header(this, 'Choose the work', ZONES[this.slot.zone].name + '  ·  ' + this.slot.name); this.title = makeText(this, W / 2, 128, 'Choose one variant. It stays forever.', 17, '#2B2D42').setDepth(25); this.ribbon = makeText(this, W / 2, 152, 'GOAL REWARD  ·  RENOVATION UNLOCKED', 11, '#4F9D69').setDepth(25); this.rewardFx = this.add.particles ? this.add.particles('tt_spark', { x: W / 2, y: 170, quantity: 16, lifespan: 720, speed: { min: 40, max: 110 }, gravityY: 120, scale: { start: .8, end: .05 }, emitting: false }).setDepth(28) : null; if (motionOn() && this.rewardFx && this.rewardFx.explode) this.rewardFx.explode(16, W / 2, 170); this.cards = []; this.buttons = []; this.buildPreviews(); publish(this, { mode: 'choice', level: this.index + 1, slots: saveData.completed, phase: 'reveal' }); kit.audio.sfx('reveal', { volume: .75 }); };
  ChoiceScene.prototype.buildPreviews = function () { for (var v = 0; v < 2; v++) { var key = 'tt_choice_' + this.index + '_' + v; bake(this, key, 340, 180, (function (scene, variant) { return function (ctx, w, h) { drawVariantPreview(ctx, w, h, scene.slot, variant, scene.index); }; })(this, v)); var card = this.add.rectangle(W / 2, 254 + v * 242, 350, 218, 0xFFF8EE, .98).setDepth(21).setStrokeStyle(2, ZONES[this.slot.zone].accent, .8); this.add.image(W / 2, 245 + v * 242, key).setDisplaySize(340, 180).setDepth(22); makeText(this, 34, 352 + v * 242, this.slot.options[v], 17, '#2B2D42', 0).setDepth(25); var b = makeButton(this, 300, 370 + v * 242, 112, 46, 'BUILD', (function (variant) { return function () { this.choose(variant); }; })(v).bind(this), { fill: 0x4F9D69, stroke: 0x2B2D42, size: 14, depth: 30 }); this.buttons.push(b); this.cards.push(card); } };
  ChoiceScene.prototype.choose = function (variant) { if (saveData.pendingChoice !== this.index) { this.scene.start('hub'); return; } saveData.choices[this.index] = variant ? 1 : 0; kit.save.set(saveData); this.scene.start('build', { index: this.index, variant: variant }); };
  ChoiceScene.prototype.update = function (time, delta) { if (pollGlobalKeys(this, true)) return; var self = this; var steps = fixedSteps(this, delta, function () { self.stepFixed(); self.gardenTime = (self.gardenTime + STEP / 42) % 1; }); if (steps) updateGardenTexture(this, null, null, steps * STEP); };
  ChoiceScene.prototype.render = function () {};
  ChoiceScene.prototype.shutdown = function () { unwireDraw(this); };

  function BuildScene() { PhaserRef.Scene.call(this, { key: 'build' }); }
  BuildScene.prototype = Object.create(PhaserRef.Scene.prototype); BuildScene.prototype.constructor = BuildScene;
  BuildScene.prototype.create = function (data) { Game.active = this; this.index = clamp(data && data.index != null ? data.index : saveData.completed, 0, 14); this.variant = data && data.variant ? 1 : 0; baseScene(this, 'build', .2); this.buildT = 0; this.bg = gardenImage(this, this.index, this.variant, 0); header(this, SLOTS[this.index].options[this.variant], 'Built into ' + ZONES[SLOTS[this.index].zone].name); this.reveal = makeText(this, W / 2, 690, 'A permanent choice for Hollowbrook Rise.', 15, '#2B2D42').setDepth(30); this.buildFx = this.add.particles ? this.add.particles('tt_dust', { x: 0, y: 0, quantity: 1, lifespan: 800, speed: { min: 28, max: 72 }, gravityY: 180, scale: { start: .9, end: .05 }, emitting: false }).setDepth(24) : null; this.rewardFx = this.add.particles ? this.add.particles('tt_spark', { x: 0, y: 0, quantity: 18, lifespan: 760, speed: { min: 50, max: 140 }, gravityY: 170, scale: { start: .9, end: .05 }, emitting: false }).setDepth(25) : null; if (motionOn() && this.rewardFx && this.rewardFx.explode) { var rewardPos = gardenSlotPosition(this.index); this.rewardFx.explode(18, rewardPos.x, rewardPos.y - 10); } this.draw = this.render.bind(this); wireDraw(this); kit.audio.music('meta', 300); kit.audio.sfx('build', { volume: .85 }); publish(this, { mode: 'build', slots: saveData.completed, phase: 'build-in' }); this.render(); };
  BuildScene.prototype.update = function (time, delta) { if (pollGlobalKeys(this, true)) return; var self = this; var steps = fixedSteps(this, delta, function (i) { self.stepFixed(); self.buildT += STEP; self.gardenTime = (self.gardenTime + STEP / 42) % 1; if (motionOn() && i % 2 === 0) self.spawnBuildParticle(); self.updateBuildParticles(); }); if (steps) updateGardenTexture(this, this.index, this.variant, steps * STEP, false, clamp(this.buildT / 1.25, 0, 1)); if (this.buildT >= 1.25) { if (saveData.pendingChoice === this.index && saveData.completed === this.index) { saveData.completed = Math.min(15, this.index + 1); saveData.pendingChoice = -1; kit.save.set(saveData); } this.scene.start(saveData.completed >= 15 ? 'finale' : 'hub', { focusSlot: this.index }); } };
  BuildScene.prototype.spawnBuildParticle = function () { if (!this.buildFx || !this.buildFx.emitParticleAt) return; var pos = gardenSlotPosition(this.index); this.buildFx.emitParticleAt(pos.x, pos.y - 8, 1); };
  BuildScene.prototype.updateBuildParticles = function () {};
  BuildScene.prototype.render = function () { var progress = clamp(this.buildT / 1.25, 0, 1); setTextIfChanged(this.reveal, progress < .7 ? 'Stone, timber, and leaf settle into place.' : 'The garden remembers this choice.'); };
  BuildScene.prototype.shutdown = function () { unwireDraw(this); };

  function FinaleScene() { PhaserRef.Scene.call(this, { key: 'finale' }); }
  FinaleScene.prototype = Object.create(PhaserRef.Scene.prototype); FinaleScene.prototype.constructor = FinaleScene;
  FinaleScene.prototype.create = function () { Game.active = this; baseScene(this, 'finale', .2); kit.audio.music('meta', 300); this.bg = gardenImage(this); header(this, 'Hollowbrook Rise', 'Restored garden · day and night continue'); this.cycle = makeText(this, W / 2, 660, '', 16, '#2B2D42').setDepth(30); this.buttons = []; this.buttons.push(makeButton(this, 122, 786, 112, 46, 'REPLAY', function () { this.scene.start('hub'); }.bind(this), { fill: 0x4F9D69, stroke: 0xF7FBFF, size: 14 })); this.buttons.push(makeButton(this, 268, 786, 112, 46, 'SETTINGS', function () { kit.openSettings(); }, { fill: BOARD, stroke: 0x5D7294, size: 14 })); this.draw = this.render.bind(this); wireDraw(this); publish(this, { mode: 'finale', slots: 15, garden: ZONES[3].name, phase: 'cycle' }); this.render(); };
  FinaleScene.prototype.update = function (time, delta) { if (pollGlobalKeys(this, true)) return; var self = this; var steps = fixedSteps(this, delta, function () { self.stepFixed(); self.gardenTime = (self.gardenTime + STEP / 42) % 1; }); if (steps) updateGardenTexture(this, null, null, steps * STEP); };
  FinaleScene.prototype.render = function () { var night = (1 - Math.cos(this.gardenTime * TAU)) / 2; setTextIfChanged(this.cycle, night > .52 ? 'Lantern hour · the rise is alive.' : 'Morning on the restored rise.'); };
  FinaleScene.prototype.shutdown = function () { unwireDraw(this); };

  function resetGarden() { saveData = blankSave(); kit.save.set(saveData); if (Game.active) Game.active.scene.start('hub'); }

  function init() {
    if (!PhaserRef || !KitRef) { DEBUG.mode = 'boot-error'; publish(null, { phase: 'missing-runtime' }); return; }
    kit = KitRef.create({ slug: 'terrace-tales', orientation: 'portrait', validateSave: validSave,
      onPause: function () { if (Game.active && Game.active.scene.isActive()) Game.active.scene.pause(); },
      onResume: function () { if (Game.active && Game.active.scene.isPaused()) Game.active.scene.resume(); },
      onRestart: function () { if (Game.active && Game.active.scene.key === 'play') Game.active.scene.restart({ index: Game.active.index, mode: Game.active.mode }); }
    });
    saveData = safeSave(); muted = !!kit.audio.prefs.mute; kit.audio.register({ ui: 'assets/ui.mp3', swap: 'assets/swap.mp3', invalid: 'assets/invalid.mp3', match: 'assets/match.mp3', cascade: 'assets/cascade.mp3', special: 'assets/special.mp3', fall: 'assets/fall.mp3', goal: 'assets/goal.mp3', reveal: 'assets/reveal.mp3', build: 'assets/build.mp3', fail: 'assets/fail.mp3', garden: 'assets/garden.mp3', board: 'assets/board.mp3', meta: 'assets/meta.mp3' });
    if (root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches) kit.juice.enabled = false; kit.registerPWA();
    root.__tt.forceLevel = function (value) { DEBUG.forceLevel = value; root.__tt.state.forceLevel = value; var idx = levelIndex(value); if (idx != null && Game.active) Game.active.scene.start('play', { index: idx, mode: 'forced' }); return idx != null; };
    root.__tt.forceSlot = function (value) { DEBUG.forceSlot = value; root.__tt.state.forceSlot = value; var idx = slotIndex(value); if (Game.active) Game.active.scene.start('hub', { focusSlot: idx }); return idx != null; };
    var config = { type: PhaserRef.AUTO, parent: document.body, width: W, height: H, backgroundColor: '#10182B', scene: [BootScene, StoryScene, HubScene, PlayScene, ChoiceScene, BuildScene, FinaleScene], scale: { mode: PhaserRef.Scale.FIT, autoCenter: PhaserRef.Scale.CENTER_BOTH }, render: { antialias: true, roundPixels: false, powerPreference: 'high-performance', batchSize: 2048 }, fps: { target: 60, min: 30 } };
    publish(null, { mode: 'boot', phase: 'boot' }); Game.phaser = new PhaserRef.Game(config);
  }
  init();
})(typeof window !== 'undefined' ? window : globalThis);
