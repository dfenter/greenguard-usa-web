/* Aftergate - boot, session orchestration, menus, results.
 *
 * GGKit is the ONLY lifecycle / input / save / audio implementation:
 * Phaser is started with its own audio and input subsystems disabled.
 */
'use strict';
var AG = window.AG || {};
window.AG = AG;
AG.RETINA_FACTOR = GGKit.hiDpi.factor(AG.DW, AG.DH);

/* ==================================================================== */
/* SESSION                                                              */
/* ==================================================================== */
AG.session = {
  mode: 'campaign', siteIndex: 0, siteId: 'recruit', roadId: 'rr1',
  squad: 6, troops: 0, wave: 1, wallHP: 0, wallMax: 0,
  wavesHeld: 0, bestSquad: 0, integrity: 1, runSeed: 1
};

AG.markTutorial = function (key) {
  if (!AG.saveData || !AG.saveData.tutorial || !Object.prototype.hasOwnProperty.call(AG.saveData.tutorial, key)) return;
  if (AG.saveData.tutorial[key]) return;
  AG.saveData.tutorial[key] = true;
  var done = true, names = ['steer', 'evade', 'portal', 'garrison', 'wallEvade'];
  for (var i = 0; i < names.length; i++) if (!AG.saveData.tutorial[names[i]]) done = false;
  if (done) AG.saveData.tutorialSeen = true;
  if (AG.kit && AG.kit.save) AG.kit.save.set(AG.saveData);
};

/* ==================================================================== */
/* ORCHESTRATOR                                                         */
/* ==================================================================== */
AG.orchestrator = {
  scene: null,

  startMode: function (mode, opts) {
    opts = opts || {};
    var s = AG.session;
    s.mode = AG.MODES[mode] ? mode : 'campaign';
    s.wavesHeld = 0; s.bestSquad = 0; s.integrity = 1;
    s.result = null; s.medal = ''; s.held = 0; s.unlocked = null; s.finalSquad = undefined;
    s.troops = 0; s.wallHP = 0; s.wallMax = 0;
    s.runSeed = (Math.random() * 1e9) | 0;
    if (s.mode === 'rush') {
      var road = AG.rushRoad(opts.roadId || 'rr1');
      s.roadId = road.id;
      s.siteIndex = 0;
      s.siteId = AG.site(road.site).id;
      s.squad = road.startSquad;
      s.wave = 0;
    } else if (s.mode === 'endless') {
      s.siteIndex = AG.SITES.length - 1;
      s.siteId = AG.siteAt(s.siteIndex).id;
      s.squad = AG.siteAt(s.siteIndex).startSquad + 6;
      s.wave = 11;
      s.wallMax = AG.siteAt(s.siteIndex).wallMax;
    } else {
      s.siteIndex = AG.clamp(opts.siteIndex || 0, 0, AG.SITES.length - 1);
      var site = AG.siteAt(s.siteIndex);
      s.siteId = site.id;
      s.squad = site.startSquad;
      s.wave = site.waves[0];
      s.wallMax = site.wallMax;
    }
    AG.goto('Run');
  },

  /* road finished */
  afterRun: function (wiped) {
    var s = AG.session;
    if (s.mode === 'rush') {
      this.finish(wiped ? 'wiped' : 'road');
      return;
    }
    if (wiped) { this.finish('wiped'); return; }
    s.troops = Math.min(AG.MAX_TROOPS, s.troops + s.squad);
    if (s.mode === 'campaign') {
      var site = AG.siteAt(s.siteIndex);
      s.wallMax = site.wallMax;
      s.wallHP = 0;              // fresh wall at every site
      s.wave = site.waves[0];
    }
    AG.goto('Base');
  },

  /* a wave was held; decide whether to stay, move site, or win */
  afterWave: function (scene) {
    var s = AG.session;
    if (s.mode === 'endless') {
      scene.wave++; s.wave = scene.wave;
      if ((scene.wave - 11) > 0 && (scene.wave - 11) % 5 === 0) {
        s.squad = 12 + Math.round(scene.wave * 1.5);
        s.runSeed = (Math.random() * 1e9) | 0;
        AG.goto('Run');
        return;
      }
      scene.openBuild(false);
      return;
    }
    var site = AG.siteAt(s.siteIndex);
    var last = site.waves[site.waves.length - 1];
    if (scene.wave < last) {
      scene.wave++; s.wave = scene.wave;
      scene.openBuild(false);
      return;
    }
    if (s.siteIndex < AG.SITES.length - 1) {
      s.siteIndex++;
      var next = AG.siteAt(s.siteIndex);
      s.siteId = next.id;
      s.squad = next.startSquad;
      s.wallMax = next.wallMax;
      s.wallHP = 0;
      s.wave = next.waves[0];
      s.runSeed = (Math.random() * 1e9) | 0;
      AG.goto('Run');
      return;
    }
    this.finish('win');
  },

  wallLost: function () { this.finish('lost'); },

  finish: function (result) {
    var s = AG.session, save = AG.saveData, changed = false, unlocked = null;
    s.result = result;
    if (s.squad > s.bestSquad) s.bestSquad = s.squad;
    if (s.bestSquad > save.bestSquad) { save.bestSquad = s.bestSquad; changed = true; }

    if (s.mode === 'rush') {
      var road = AG.rushRoad(s.roadId);
      var finalSquad = result === 'wiped' ? 0 : s.squad;
      var medal = AG.rushMedal(road.id, finalSquad);
      var row = save.rush[road.id] || (save.rush[road.id] = { best: 0, medal: '' });
      var hadMedal = AG.MEDAL_ORDER[row.medal] > 0;
      if (finalSquad > row.best) { row.best = finalSquad; changed = true; }
      if (AG.MEDAL_ORDER[medal] > AG.MEDAL_ORDER[row.medal]) { row.medal = medal; changed = true; }
      s.medal = medal;
      s.finalSquad = finalSquad;
      if (!hadMedal && AG.MEDAL_ORDER[medal] > 0) {
        var idx = AG.rushIndex(road.id);
        if (idx + 1 < AG.RUSH_ROADS.length) unlocked = AG.RUSH_ROADS[idx + 1].name;
      }
    } else if (s.mode === 'endless') {
      var held = Math.max(0, s.wavesHeld - 10);
      s.held = held;
      s.medal = AG.endlessMedal(held);
      if (held > save.endless.best) { save.endless.best = held; changed = true; }
      if (AG.MEDAL_ORDER[s.medal] > AG.MEDAL_ORDER[save.endless.medal]) { save.endless.medal = s.medal; changed = true; }
    } else {
      s.held = s.wavesHeld;
      s.medal = AG.campaignMedal({ waves: s.wavesHeld, integrity: s.integrity, bestSquad: s.bestSquad });
      if (s.wavesHeld > save.campaign.best) { save.campaign.best = s.wavesHeld; changed = true; }
      if (s.bestSquad > save.campaign.bestSquad) { save.campaign.bestSquad = s.bestSquad; changed = true; }
      if (AG.MEDAL_ORDER[s.medal] > AG.MEDAL_ORDER[save.campaign.medal]) { save.campaign.medal = s.medal; changed = true; }
      if (result === 'win' && !save.campaign.cleared) { save.campaign.cleared = true; changed = true; }
    }
    if (!save.tutorialSeen) { save.tutorialSeen = true; changed = true; }
    if (changed) AG.kit.save.set(save);
    s.unlocked = unlocked;
    AG.goto('Result');
  },

  /* boot-fallback + live test switches share this one entry point */
  applyForce: function () {
    var h = window.__ag;
    if (!h || !h.pending) return;
    var p = h.pending;
    h.pending = null;
    if (p.mode) {
      AG.orchestrator.startMode(p.mode.m, p.mode.o);
      if (p.wave) AG.orchestrator.forceWaveNow(p.wave.n);
    } else if (p.wave) {
      AG.orchestrator.forceWaveNow(p.wave.n);
    }
  },
  forceWaveNow: function (n) {
    var s = AG.session;
    n = AG.clamp(n | 0, 1, 999);
    s.wave = n;
    if (s.mode === 'campaign') {
      for (var i = 0; i < AG.SITES.length; i++) {
        var st = AG.SITES[i];
        if (st.waves.indexOf(n) >= 0) {
          s.siteIndex = i; s.siteId = st.id; s.wallMax = st.wallMax;
          break;
        }
      }
    }
    s.wallHP = 0;
    s.troops = Math.max(s.troops, 60 + n * 12);
    s.squad = Math.max(s.squad, 40 + n * 8);
    AG.goto('Base');
  }
};

/* scene switching always goes through here so the hook stays truthful */
AG.goto = function (key, data) {
  var g = AG.game;
  if (!g) return;
  if (AG.kit && AG.kit.input) AG.kit.input.clearAll();
  if (AG.input) AG.input.clear();
  var active = g.scene.getScenes(true);
  if (active.length) active[0].scene.start(key, data);
  else g.scene.start(key, data);
  if (window.__ag) window.__ag.state.scene = key.toLowerCase();
};

/* ==================================================================== */
/* SHARED MENU HELPERS                                                  */
/* ==================================================================== */
function tapButtons(scene, list) {
  var i, j;
  for (i = 0; i < AG.input.downs.length; i++) {
    var d = AG.input.downs[i];
    for (j = 0; j < list.length; j++) {
      if (list[j].enabled && list[j].hit(d.x, d.y)) { list[j].press(true); AG.input.claim(d, 'btn'); break; }
    }
  }
  for (i = 0; i < AG.input.ups.length; i++) {
    var u = AG.input.ups[i];
    for (j = 0; j < list.length; j++) list[j].press(false);
    if (u.cancelled) continue;
    for (j = 0; j < list.length; j++) {
      if (list[j].enabled && list[j].hit(u.x, u.y)) {
        AG.kit.audio.sfx('click', { volume: 0.6 });
        list[j].onTap();
        return true;
      }
    }
  }
  return false;
}

/* ==================================================================== */
/* BOOT SCENE                                                           */
/* ==================================================================== */
function BootScene() { Phaser.Scene.call(this, { key: 'Boot' }); }
BootScene.prototype = Object.create(Phaser.Scene.prototype);
BootScene.prototype.constructor = BootScene;
BootScene.prototype.create = function () {
  this.cameras.main.setZoom(AG.RETINA_FACTOR);
  AG.ui.init();
  AG.kit.loader.progress(0.35);
  AG.art.buildAll(this);
  AG.kit.loader.progress(0.8);
  AG.art.buildAudio(AG.kit);
  AG.kit.loader.progress(1);
  AG.kit.loader.hide();
  AG.booted = true;
  var self = this;
  // test switches must work from the boot fallback as well as live
  if (window.__ag && window.__ag.pending) {
    this.time.delayedCall(1, function () { AG.orchestrator.applyForce(); });
    return;
  }
  this.scene.start('Menu');
};

/* ==================================================================== */
/* MENU SCENE                                                           */
/* ==================================================================== */
function MenuScene() { Phaser.Scene.call(this, { key: 'Menu' }); }
MenuScene.prototype = Object.create(Phaser.Scene.prototype);
MenuScene.prototype.constructor = MenuScene;

MenuScene.prototype.create = function () {
  this.cameras.main.setZoom(AG.RETINA_FACTOR);
  var self = this, i;
  AG.input.clear();
  AG.ui.measureSafe();
  this.cameras.main.setBackgroundColor(0x0b0d12);
  var top = AG.ui.safe.top, bottom = DHsafe();
  var save = AG.saveData;

  this.add.image(AG.DW / 2, top + 160, 'title_mark').setDepth(1).setAlpha(0.9);
  AG.ui.strong(this, AG.DW / 2, top + 256, 'AFTERGATE', 46, '#ffd479').setDepth(2);
  AG.ui.label(this, AG.DW / 2, top + 300, 'Take the bigger gate. Hold the wall.', 17, '#9fb0c6').setDepth(2);

  /* ---- mode panel ---- */
  this.modePanel = this.add.container(0, 0).setDepth(3);
  this.modeBtns = [];
  var y0 = top + 400;
  for (i = 0; i < AG.MODE_KEYS.length; i++) {
    (function (idx) {
      var mk = AG.MODE_KEYS[idx], md = AG.mode(mk);
      var sub = '';
      var medal = '';
      if (mk === 'campaign') { sub = save.campaign.best > 0 ? ('Best ' + save.campaign.best + '/10 waves') : md.sub; medal = save.campaign.medal; }
      else if (mk === 'rush') { sub = AG.rushProgress(save) + ' of ' + AG.RUSH_ROADS.length + ' roads cleared'; }
      else { sub = save.endless.best > 0 ? ('Best ' + save.endless.best + ' past the gate') : md.sub; medal = save.endless.medal; }
      var b = new AG.ui.Button(self, {
        x: AG.DW / 2, y: y0 + idx * 108, w: 470, h: 92,
        icon: md.icon, iconX: -190, iconScale: 0.9,
        text: md.name, textX: -20, textY: -16, size: 26,
        sub: sub, texture: 'btn9',
        onTap: function () {
          if (mk === 'rush') self.showRush();
          else AG.orchestrator.startMode(mk);
        }
      });
      b.text.setOrigin(0, 0.5); b.sub.setOrigin(0, 0.5);
      b.setDepth(4);
      self.modePanel.add(b.c);
      if (medal && AG.MEDAL_ORDER[medal]) {
        var mi = self.add.image(190, 0, 'medal_' + medal).setScale(0.8);
        b.c.add(mi);
      }
      self.modeBtns.push(b);
    })(i);
  }

  /* ---- rush panel ---- */
  this.rushPanel = this.add.container(0, 0).setDepth(3).setVisible(false);
  this.rushBtns = [];
  var rt = AG.ui.strong(this, AG.DW / 2, top + 210, 'GATE RUSH', 32, '#7ee0a8');
  this.rushPanel.add(rt);
  for (i = 0; i < AG.RUSH_ROADS.length; i++) {
    (function (idx) {
      var road = AG.RUSH_ROADS[idx];
      var row = save.rush[road.id] || { best: 0, medal: '' };
      var open = AG.rushUnlocked(save, idx);
      var b = new AG.ui.Button(self, {
        x: AG.DW / 2, y: top + 274 + idx * 84, w: 470, h: 72,
        text: (idx + 1) + '. ' + road.name, textX: -196, textY: -12, size: 21,
        sub: open ? ('Best ' + row.best + '   Gold ' + road.medals.gold) : 'Clear the road before it',
        texture: 'btn9', enabled: open,
        onTap: function () { AG.orchestrator.startMode('rush', { roadId: road.id }); }
      });
      b.text.setOrigin(0, 0.5); b.sub.setOrigin(0, 0.5);
      b.sub.x = -196;
      b.setDepth(4);
      self.rushPanel.add(b.c);
      if (!open) {
        b.c.add(self.add.image(198, 0, 'ico_lock').setScale(0.9));
      } else if (row.medal && AG.MEDAL_ORDER[row.medal]) {
        b.c.add(self.add.image(198, 0, 'medal_' + row.medal).setScale(0.7));
      }
      self.rushBtns.push(b);
    })(i);
  }
  this.backBtn = new AG.ui.Button(this, {
    x: 66, y: top + 210, w: 84, h: 56, icon: 'ico_back', iconX: 0, iconScale: 0.9,
    texture: 'btn9', onTap: function () { self.showModes(); }
  });
  this.backBtn.setDepth(4);
  this.rushPanel.add(this.backBtn.c);

  /* ---- footer controls ---- */
  this.settingsBtn = new AG.ui.Button(this, {
    x: AG.DW - 48, y: bottom - 48, w: 68, h: 68, icon: 'ico_sound', iconX: 0, iconScale: 0.95,
    texture: 'btn9', onTap: function () { AG.kit.openSettings(); }
  });
  this.settingsBtn.setDepth(5);
  AG.ui.label(this, AG.DW / 2, bottom - 96,
    'Drag to steer. Tap a role then a wall slot.', 15, '#6d7d92').setDepth(5);
  AG.ui.label(this, AG.DW / 2, bottom - 70,
    'Biggest squad ' + save.bestSquad, 15, '#6d7d92').setDepth(5);

  this.mode = 'modes';
  this.focusIndex = 0;
  this.showModes();
  AG.kit.audio.music('mus_road', 700);
  if (window.__ag) { window.__ag.state.scene = 'menu'; window.__ag.state.phase = 'menu'; }
};
MenuScene.prototype.showModes = function () {
  this.mode = 'modes';
  this.focusIndex = 0;
  this.modePanel.setVisible(true);
  this.rushPanel.setVisible(false);
  this.refreshFocus();
};
MenuScene.prototype.showRush = function () {
  this.mode = 'rush';
  this.focusIndex = 0;
  while (this.focusIndex < this.rushBtns.length && !this.rushBtns[this.focusIndex].enabled) this.focusIndex++;
  if (this.focusIndex >= this.rushBtns.length) this.focusIndex = 0;
  this.modePanel.setVisible(false);
  this.rushPanel.setVisible(true);
  this.refreshFocus();
};
MenuScene.prototype.refreshFocus = function () {
  var list = this.mode === 'modes' ? this.modeBtns : this.rushBtns;
  for (var i = 0; i < list.length; i++) {
    var b = list[i], focused = i === this.focusIndex && b.enabled;
    AG.ui.setTint(b.bg, focused ? 0x35506f : 0x1d2a3c);
    b.c.setScale(focused ? 1.025 : 1);
  }
};
MenuScene.prototype.update = function () {
  AG.input.poll();
  if (AG.kit.paused) return;
  var list = (this.mode === 'modes' ? this.modeBtns : this.rushBtns).slice();
  if (this.mode === 'rush') list.push(this.backBtn);
  list.push(this.settingsBtn);
  tapButtons(this, list);
  var pad = AG.input.pad;
  var up = AG.input.pressed('ArrowUp') || (pad && pad.upPressed);
  var down = AG.input.pressed('ArrowDown') || (pad && pad.downPressed);
  if (up || down) {
    var focusList = this.mode === 'modes' ? this.modeBtns : this.rushBtns;
    var step = down ? 1 : -1, next = this.focusIndex;
    for (var tries = 0; tries < focusList.length; tries++) {
      next = (next + step + focusList.length) % focusList.length;
      if (focusList[next].enabled) break;
    }
    this.focusIndex = next;
    this.refreshFocus();
  }
  if (AG.input.pressed('Enter') || AG.input.pressed('Space') || (pad && pad.confirmPressed)) {
    var focusedList = this.mode === 'modes' ? this.modeBtns : this.rushBtns;
    if (focusedList[this.focusIndex] && focusedList[this.focusIndex].enabled) focusedList[this.focusIndex].onTap();
  }
  if (AG.input.pressed('Escape') || (pad && pad.backPressed)) if (this.mode === 'rush') this.showModes();
};

/* ==================================================================== */
/* RESULT SCENE                                                         */
/* ==================================================================== */
function ResultScene() { Phaser.Scene.call(this, { key: 'Result' }); }
ResultScene.prototype = Object.create(Phaser.Scene.prototype);
ResultScene.prototype.constructor = ResultScene;

ResultScene.prototype.create = function () {
  this.cameras.main.setZoom(AG.RETINA_FACTOR);
  var self = this, s = AG.session;
  AG.input.clear();
  AG.ui.measureSafe();
  this.cameras.main.setBackgroundColor(0x080b12);
  var top = AG.ui.safe.top, bottom = DHsafe();

  var win = (s.result === 'win');
  var title, color;
  if (s.mode === 'rush') {
    title = s.result === 'wiped' ? 'SQUAD WIPED' : 'ROAD CLEARED';
    color = s.result === 'wiped' ? '#ff6b6b' : '#7ee0a8';
  } else if (win) { title = 'THE WALL HOLDS'; color = '#7ee0a8'; }
  else if (s.result === 'wiped') { title = 'SQUAD WIPED'; color = '#ff6b6b'; }
  else { title = 'THE WALL FALLS'; color = '#ff6b6b'; }

  AG.ui.strong(this, AG.DW / 2, top + 130, title, 40, color).setDepth(2);

  var medal = s.medal || '';
  var y = top + 220;
  if (medal && AG.MEDAL_ORDER[medal]) {
    var mi = this.add.image(AG.DW / 2, y + 30, 'medal_' + medal).setScale(1.8).setDepth(2);
    AG.ui.label(this, AG.DW / 2, y + 96, medal.toUpperCase(), 22, AG.MEDAL_CSS[medal]).setDepth(2);
    if (!AG.ui.reduced) {
      mi.setScale(0.4);
      this.tweens.add({ targets: mi, scaleX: 1.8, scaleY: 1.8, duration: 520, ease: 'Back.easeOut' });
    }
    AG.kit.audio.sfx('medal', { volume: 0.9 });
    y += 140;
  } else {
    AG.ui.label(this, AG.DW / 2, y + 24, 'No medal this run', 17, '#6d7d92').setDepth(2);
    y += 70;
  }

  var rows = [];
  if (s.mode === 'rush') {
    var road = AG.rushRoad(s.roadId);
    rows.push(['Road', road.name]);
    rows.push(['Squad at the end', String(s.finalSquad === undefined ? s.squad : s.finalSquad)]);
    rows.push(['Best here', String((AG.saveData.rush[road.id] || { best: 0 }).best)]);
    rows.push(['Gold at', String(road.medals.gold)]);
  } else if (s.mode === 'endless') {
    rows.push(['Waves past the gate', String(s.held || 0)]);
    rows.push(['Biggest squad', String(s.bestSquad)]);
    rows.push(['Best run', String(AG.saveData.endless.best)]);
  } else {
    rows.push(['Waves held', (s.wavesHeld || 0) + ' / 10']);
    rows.push(['Biggest squad', String(s.bestSquad)]);
    rows.push(['Wall integrity', Math.round((s.integrity || 0) * 100) + '%']);
    rows.push(['Best run', AG.saveData.campaign.best + ' / 10']);
  }
  for (var i = 0; i < rows.length; i++) {
    AG.ui.label(this, 70, y + i * 34, rows[i][0], 17, '#9fb0c6', 0).setDepth(2);
    AG.ui.label(this, AG.DW - 70, y + i * 34, rows[i][1], 19, '#e8edf5', 1).setDepth(2);
  }
  y += rows.length * 34 + 20;

  if (s.unlocked) {
    AG.ui.strong(this, AG.DW / 2, y, 'UNLOCKED: ' + s.unlocked, 20, '#ffd479').setDepth(2);
    y += 40;
  }

  this.btns = [];
  var again = new AG.ui.Button(this, {
    x: AG.DW / 2, y: bottom - 150, w: 440, h: 76, text: 'RUN AGAIN', size: 25,
    color: '#a9f5cd', texture: 'btn9', tint: 0x2a5a44,
    onTap: function () {
      if (s.mode === 'rush') AG.orchestrator.startMode('rush', { roadId: s.roadId });
      else AG.orchestrator.startMode(s.mode);
    }
  });
  again.setDepth(3);
  this.btns.push(again);
  var menu = new AG.ui.Button(this, {
    x: AG.DW / 2, y: bottom - 62, w: 440, h: 68, text: 'MENU', size: 22,
    color: '#8fd0ff', texture: 'btn9',
    onTap: function () { AG.goto('Menu'); }
  });
  menu.setDepth(3);
  this.btns.push(menu);

  if (window.__ag) { window.__ag.state.scene = 'result'; window.__ag.state.phase = s.result || 'over'; }
};
ResultScene.prototype.update = function () {
  AG.input.poll();
  if (AG.kit.paused) return;
  tapButtons(this, this.btns);
  var pad = AG.input.pad;
  if (AG.input.pressed('Enter') || AG.input.pressed('Space') || AG.input.pressed('KeyR') || (pad && pad.confirmPressed)) this.btns[0].onTap();
  if (AG.input.pressed('Escape') || (pad && pad.backPressed)) AG.goto('Menu');
};

function DHsafe() { return AG.DH - AG.ui.safe.bottom; }

/* ==================================================================== */
/* BOOT                                                                 */
/* ==================================================================== */
(function boot() {
  /* ---- verification hook: live implementation replaces the inline
     fallback declared in index.html, and drains anything queued ---- */
  if (!window.__ag) {
    window.__ag = { state: {}, pending: null };
  }
  var hook = window.__ag;
  hook.state = hook.state || {};
  hook.forceMode = function (m, o) {
    hook.pending = hook.pending || {};
    hook.pending.mode = { m: m, o: o || {} };
    if (AG.booted) AG.orchestrator.applyForce();
    return true;
  };
  hook.forceWave = function (n) {
    hook.pending = hook.pending || {};
    hook.pending.wave = { n: n };
    if (AG.booted) AG.orchestrator.applyForce();
    return true;
  };
  hook.reset = function () { AG.kit.save.clear(); AG.saveData = AG.defaultSave(); AG.goto('Menu'); return true; };

  /* ---- GGKit: the one lifecycle / input / save / audio owner ---- */
  var kit = GGKit.create({
    slug: 'aftergate',
    orientation: 'portrait',
    validateSave: AG.validateSave,
    onPause: function () { if (AG.game) AG.game.loop.sleep(); },
    onResume: function () { if (AG.game) { AG.game.loop.wake(); } },
    onRestart: function () { AG.goto('Menu'); }
  });
  AG.kit = kit;
  // GGKit owns the controller snapshot as an input source alongside its
  // pointer and keyboard maps. Phaser's gamepad plugin stays disabled.
  (function installGamepad(input) {
    var previous = [], previousDir = 0, previousY = 0, wasConnected = false;
    function dead(v) { return Math.abs(v) < 0.20 ? 0 : AG.clamp(v, -1, 1); }
    input.gamepad = function () {
      var pads = [], pad = null;
      try { pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : []; } catch (e) { pads = []; }
      for (var i = 0; i < pads.length; i++) if (pads[i] && pads[i].connected) { pad = pads[i]; break; }
      if (!pad) {
        var disconnected = wasConnected; wasConnected = false; previous = []; previousDir = 0; previousY = 0;
        return { connected: false, justDisconnected: disconnected, x: 0, y: 0 };
      }
      var buttons = [];
      for (i = 0; i < (pad.buttons || []).length; i++) buttons[i] = !!pad.buttons[i].pressed;
      function edge(n) { return !!buttons[n] && !previous[n]; }
      var x = dead(pad.axes && pad.axes[0] || 0), y = dead(pad.axes && pad.axes[1] || 0);
      var dir = x < 0 ? -1 : (x > 0 ? 1 : 0);
      var yDir = y < 0 ? -1 : (y > 0 ? 1 : 0);
      var dLeft = !!buttons[14], dRight = !!buttons[15];
      var state = {
        connected: true, justConnected: !wasConnected, justDisconnected: false,
        x: x, y: y, confirmPressed: edge(0), evadePressed: edge(1),
        backPressed: edge(2) || edge(9),
        leftPressed: dLeft && !previous[14] || dLeft === false && dir < 0 && previousDir !== -1,
        rightPressed: dRight && !previous[15] || dRight === false && dir > 0 && previousDir !== 1,
        upPressed: edge(12) || (yDir < 0 && previousY !== -1),
        downPressed: edge(13) || (yDir > 0 && previousY !== 1)
      };
      previous = buttons; previousDir = dir; previousY = yDir; wasConnected = true;
      return state;
    };
    input.gamepad.reset = function () { previous = []; previousDir = 0; previousY = 0; wasConnected = false; };
  })(kit.input);
  AG.saveData = AG.normalizeSave(kit.save.get(null));
  kit.loader.show('Aftergate');

  AG.ui.init();

  var config = {
    type: Phaser.AUTO,
    parent: document.body,       // never null: null skips DOM mounting
    backgroundColor: '#0b0d12',
    banner: false,
    audio: { noAudio: true },    // GGKit owns audio
    input: { keyboard: false, mouse: false, touch: false, gamepad: false },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: AG.DW, height: AG.DH
    },
    scene: [BootScene, MenuScene, AG.RunScene, AG.BaseScene, ResultScene]
  };
  config.scale.width = Math.round(AG.DW * AG.RETINA_FACTOR);
  config.scale.height = Math.round(AG.DH * AG.RETINA_FACTOR);
  config.render = Object.assign({}, GGKit.renderDefaults, config.render || {});
  var game = new Phaser.Game(config);
  AG.game = game;
  AG.input.attach(kit, game);

  game.events.once('ready', function () {
    AG.ui.measureSafe();
    kit.registerPWA();
  });
})();
