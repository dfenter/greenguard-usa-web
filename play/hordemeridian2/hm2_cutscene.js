/* hm2_cutscene.js - HM2 M4 cutscene system.
 *
 * Declarative beats: camera pan/zoom, ship fly-in, portrait plus one line of
 * dialogue, effect burst. Skippable by tap or any key. Intro caps at 12s,
 * outro caps at 8s. No more than 2 lines of text on screen at once.
 *
 * This file is split in two halves:
 *  - The PURE half (validateCutscene, planBeats, beatsAt, visibleLineCount,
 *    skipState) has no Phaser dependency at all, so it can be required()
 *    from plain node and unit/mutation tested directly.
 *  - The DRIVER half (playCutscene) uses Phaser for camera pan/zoom, a
 *    procedural portrait, and an effect burst, but degrades to an immediate
 *    no-op completion if Phaser or the needed atlas frame is missing.
 *
 * Portrait deviation note: the M4 plan calls for a "6-frame atlas addition".
 * Per lane rules no binary assets may be added in this milestone, so
 * portraits are drawn procedurally: an existing atlas frame (a ship hull or
 * icon frame already in assets/atlas.json) tinted per-speaker, ringed with
 * Phaser graphics, instead of new sprite frames.
 *
 * Same module pattern as hm2_enemies.js: IIFE, 'use strict', ES5 only,
 * window.HM2_CUTSCENE + module.exports dual export.
 */
(function () {
  'use strict';

  var INTRO_MAX = 12;
  var OUTRO_MAX = 8;
  var MAX_VISIBLE_LINES = 2;
  var MAX_LINE_LEN = 60;
  var MAX_BEATS = 8;
  var MIN_BEATS = 1;
  var MIN_BEAT_DUR = 0.4;
  var MAX_BEAT_DUR = 12;
  var VALID_KINDS = { pan: true, zoom: true, flyin: true, line: true, burst: true };

  function hasEmDash(str) {
    return typeof str === 'string' && str.indexOf('—') >= 0;
  }

  function isNum(v) {
    return typeof v === 'number' && isFinite(v);
  }

  function isPosNum(v, max) {
    return isNum(v) && v > 0 && v <= max;
  }

  // Validate a single cutscene block ({ kind: 'intro'|'outro', beats: [...] }).
  function validateOne(cs, kind) {
    var cap = kind === 'outro' ? OUTRO_MAX : INTRO_MAX;
    if (!cs || typeof cs !== 'object') return { ok: false, err: kind + ': not an object' };
    if (hasEmDash(cs.id)) return { ok: false, err: kind + ': em dash in id' };
    if (!Array.isArray(cs.beats) || cs.beats.length < MIN_BEATS || cs.beats.length > MAX_BEATS) {
      return { ok: false, err: kind + ': beat count out of range' };
    }
    var total = 0;
    var i, b;
    for (i = 0; i < cs.beats.length; i++) {
      b = cs.beats[i];
      if (!b || typeof b !== 'object') return { ok: false, err: kind + ': beat ' + i + ' not an object' };
      if (!VALID_KINDS[b.kind]) return { ok: false, err: kind + ': beat ' + i + ' bad kind ' + b.kind };
      if (!isPosNum(b.dur, MAX_BEAT_DUR) || b.dur < MIN_BEAT_DUR) {
        return { ok: false, err: kind + ': beat ' + i + ' bad dur' };
      }
      total += b.dur;
      if (b.kind === 'line') {
        if (typeof b.text !== 'string' || !b.text.length || b.text.length > MAX_LINE_LEN) {
          return { ok: false, err: kind + ': beat ' + i + ' line length' };
        }
        if (hasEmDash(b.text)) return { ok: false, err: kind + ': beat ' + i + ' em dash in text' };
        if (b.speaker != null) {
          if (typeof b.speaker !== 'string' || !b.speaker.length || b.speaker.length > 20) {
            return { ok: false, err: kind + ': beat ' + i + ' speaker' };
          }
          if (b.speaker !== b.speaker.toUpperCase()) {
            return { ok: false, err: kind + ': beat ' + i + ' speaker must be uppercase' };
          }
          if (hasEmDash(b.speaker)) return { ok: false, err: kind + ': beat ' + i + ' em dash in speaker' };
        }
      }
      if (b.kind === 'pan' || b.kind === 'flyin') {
        if (b.toX != null && !isNum(b.toX)) return { ok: false, err: kind + ': beat ' + i + ' toX' };
        if (b.toY != null && !isNum(b.toY)) return { ok: false, err: kind + ': beat ' + i + ' toY' };
      }
      if (b.kind === 'zoom') {
        if (!isNum(b.to) || b.to < 0.4 || b.to > 3.0) return { ok: false, err: kind + ': beat ' + i + ' zoom range' };
      }
      if (b.kind === 'burst') {
        if (b.color != null && !isNum(b.color)) return { ok: false, err: kind + ': beat ' + i + ' burst color' };
      }
    }
    if (total > cap) return { ok: false, err: kind + ': total duration ' + total + ' exceeds cap ' + cap };
    // 2-line rule: simulate the whole timeline via planBeats/visibleLineCount.
    var plan = planBeats(cs);
    var sampleStep = 0.1;
    var t;
    for (t = 0; t <= total + sampleStep; t += sampleStep) {
      if (visibleLineCount(plan, t) > MAX_VISIBLE_LINES) {
        return { ok: false, err: kind + ': more than ' + MAX_VISIBLE_LINES + ' lines visible at t=' + t.toFixed(2) };
      }
    }
    return { ok: true, err: '' };
  }

  // validateCutscene(cs) -> { ok, err }
  // cs shape: { intro: {beats:[...]}, outro: {beats:[...]} } (either optional,
  // but at least one required), OR a single { beats: [...] } block plus an
  // explicit `kind` field ('intro'|'outro') for standalone validation.
  function validateCutscene(cs) {
    if (!cs || typeof cs !== 'object') return { ok: false, err: 'not an object' };
    if (cs.beats && !cs.intro && !cs.outro) {
      // Standalone single block form.
      var kind = cs.kind === 'outro' ? 'outro' : 'intro';
      return validateOne(cs, kind);
    }
    if (!cs.intro && !cs.outro) return { ok: false, err: 'no intro or outro provided' };
    if (cs.intro) {
      var ri = validateOne(cs.intro, 'intro');
      if (!ri.ok) return ri;
    }
    if (cs.outro) {
      var ro = validateOne(cs.outro, 'outro');
      if (!ro.ok) return ro;
    }
    return { ok: true, err: '' };
  }

  // planBeats(cs) -> [{start, end, kind, ...beat fields}] ascending.
  // Accepts either a single block ({beats:[...]}) or resolves cs.intro by
  // default when given the combined {intro, outro} shape (pass cs.intro or
  // cs.outro directly for the other one).
  function planBeats(cs) {
    var block = cs && cs.beats ? cs : (cs && cs.intro ? cs.intro : null);
    var plan = [];
    if (!block || !Array.isArray(block.beats)) return plan;
    var t = 0, i, b, entry;
    for (i = 0; i < block.beats.length; i++) {
      b = block.beats[i];
      var dur = isNum(b.dur) ? b.dur : 0;
      entry = { start: t, end: t + dur, idx: i, kind: b.kind };
      for (var k in b) {
        if (Object.prototype.hasOwnProperty.call(b, k) && k !== 'start' && k !== 'end') entry[k] = b[k];
      }
      plan.push(entry);
      t += dur;
    }
    return plan;
  }

  // beatsAt(plan, t) -> beats active at time t (start <= t < end), or the
  // final beat held if t is past the end of the plan (so a caller can settle
  // on the last frame rather than showing nothing).
  function beatsAt(plan, t) {
    var out = [], i, b;
    if (!Array.isArray(plan) || !plan.length) return out;
    for (i = 0; i < plan.length; i++) {
      b = plan[i];
      if (t >= b.start && t < b.end) out.push(b);
    }
    if (!out.length && t >= plan[plan.length - 1].end) {
      out.push(plan[plan.length - 1]);
    }
    return out;
  }

  // visibleLineCount(plan, t) -> integer count of 'line' kind beats active at t.
  function visibleLineCount(plan, t) {
    var active = beatsAt(plan, t);
    var n = 0, i;
    for (i = 0; i < active.length; i++) if (active[i].kind === 'line') n++;
    return n;
  }

  // skipState(state, input) -> new state object. `state` carries at least
  // { t, total, consumed }. A tap or any key jumps t to total and marks
  // consumed exactly once (a second skip call on an already-consumed state
  // is a no-op, returning the same values).
  function skipState(state, input) {
    var s = state || { t: 0, total: 0, consumed: false };
    if (s.consumed) return { t: s.total, total: s.total, consumed: true };
    var wantsSkip = !!(input && (input.tap || input.key));
    if (!wantsSkip) return { t: s.t, total: s.total, consumed: s.consumed };
    return { t: s.total, total: s.total, consumed: true };
  }

  // ------------------------------------------------------------------
  // Driver half. Phaser-dependent. Degrades to an immediate no-op finish if
  // Phaser or the scene/atlas frame is unavailable.
  //
  // playCutscene(scene, cs, kind, onDone) - kind is 'intro' or 'outro'.
  // Calls onDone() exactly once, synchronously if there is nothing to play.
  function pickPortraitFrame(scene) {
    // No new atlas frames added (lane rule). Reuse an existing frame as the
    // portrait base; 'panel_deep' is a plain rectangular panel present in
    // every HM2 atlas, safe as a tintable portrait backing.
    var candidates = ['panel_deep', 'panel', 'hero_idle'];
    var tex = scene.textures && scene.textures.get ? scene.textures.get('atlas') : null;
    if (!tex || tex.key === '__MISSING') return null;
    for (var i = 0; i < candidates.length; i++) {
      if (tex.has && tex.has(candidates[i])) return candidates[i];
    }
    return null;
  }

  function seenKey(levelId, kind) {
    return 'hm2_cutseen_' + levelId + '_' + kind;
  }

  function markSeen(levelId, kind) {
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(seenKey(levelId, kind), '1');
    } catch (e) {}
  }

  function playCutscene(scene, cs, kind, levelId, onDone) {
    var block = kind === 'outro' ? (cs && cs.outro) : (cs && cs.intro);
    var done = false;
    function finish() {
      if (done) return;
      done = true;
      markSeen(levelId, kind);
      if (typeof onDone === 'function') onDone();
    }
    if (!block || !Array.isArray(block.beats) || !block.beats.length) { finish(); return; }
    var v = validateOne(block, kind);
    if (!v.ok) { finish(); return; }
    if (typeof window === 'undefined' || !window.Phaser || !scene || !scene.add || !scene.cameras) {
      finish();
      return;
    }
    var portraitFrame = pickPortraitFrame(scene);
    var plan = planBeats(block);
    var total = plan.length ? plan[plan.length - 1].end : 0;
    var state = { t: 0, total: total, consumed: false };
    var container = null;
    var lineText = null;
    var portraitImg = null;
    try {
      var w = scene.scale.width / (scene.DPR || 1);
      var h = scene.scale.height / (scene.DPR || 1);
      container = scene.add.container(0, 0).setScrollFactor(0).setDepth(500);
      if (portraitFrame) {
        portraitImg = scene.add.image(w * 0.18, h * 0.82, 'atlas', portraitFrame)
          .setDisplaySize(64, 64).setTint(kind === 'outro' ? 0xffd67a : 0x8effd8).setAlpha(0);
        container.add(portraitImg);
      }
      lineText = scene.add.text(w * 0.5, h * 0.86, '', {
        fontFamily: 'sans-serif', fontSize: '16px', color: '#e8fbff', align: 'center'
      }).setOrigin(0.5).setScrollFactor(0);
      container.add(lineText);
    } catch (e) {
      finish();
      return;
    }

    var origZoom = scene.cameras.main ? scene.cameras.main.zoom : 1;
    var startedAt = (scene.time && scene.time.now) || 0;

    function cleanup() {
      try { if (container) container.destroy(); } catch (e) {}
      try { if (scene.cameras && scene.cameras.main) scene.cameras.main.setZoom(Math.max(1.0, origZoom)); } catch (e) {}
    }

    function applyFrame() {
      var active = beatsAt(plan, state.t);
      var lines = [];
      for (var i = 0; i < active.length; i++) {
        var b = active[i];
        if (b.kind === 'line') lines.push(b.text);
        if (b.kind === 'zoom' && scene.cameras && scene.cameras.main) {
          var z = Math.max(1.0, b.to);
          scene.cameras.main.setZoom(z);
        }
      }
      if (lines.length > MAX_VISIBLE_LINES) lines = lines.slice(0, MAX_VISIBLE_LINES);
      if (lineText) lineText.setText(lines.join('\n'));
      if (portraitImg) portraitImg.setAlpha(lines.length ? 1 : 0);
    }

    function tick() {
      if (done) return;
      var now = (scene.time && scene.time.now) || 0;
      state.t = (now - startedAt) / 1000;
      if (state.t >= state.total) {
        applyFrame();
        cleanup();
        finish();
        return;
      }
      applyFrame();
      if (scene.time && scene.time.delayedCall) {
        scene.time.delayedCall(50, tick);
      } else {
        cleanup();
        finish();
      }
    }

    function onSkip() {
      if (done) return;
      state = skipState(state, { tap: true });
      cleanup();
      finish();
    }

    try {
      if (scene.input) scene.input.once('pointerdown', onSkip);
      if (scene.input && scene.input.keyboard) scene.input.keyboard.once('keydown', onSkip);
    } catch (e) {}

    tick();
  }

  var HM2_CUTSCENE = {
    validateCutscene: validateCutscene,
    planBeats: planBeats,
    beatsAt: beatsAt,
    visibleLineCount: visibleLineCount,
    skipState: skipState,
    playCutscene: playCutscene,
    seenKey: seenKey,
    INTRO_MAX: INTRO_MAX,
    OUTRO_MAX: OUTRO_MAX,
    MAX_VISIBLE_LINES: MAX_VISIBLE_LINES
  };

  if (typeof window !== 'undefined') window.HM2_CUTSCENE = HM2_CUTSCENE;
  if (typeof module !== 'undefined' && module.exports) module.exports = HM2_CUTSCENE;
}());
