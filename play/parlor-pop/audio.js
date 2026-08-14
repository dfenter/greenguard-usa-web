/* Audio is deliberately only a thin GGKit bus adapter. */
(function (root) {
  'use strict';
  var kit = null;
  var unlocked = false;
  var FILES = {
    swap_tick: 'assets/swap_tick.mp3',
    invalid_move: 'assets/invalid_move.mp3',
    match_pop: 'assets/match_pop.mp3',
    crate_smash: 'assets/crate_smash.mp3',
    ivy_threat: 'assets/ivy_threat.mp3',
    booster_payoff: 'assets/booster_payoff.mp3',
    goal_clear: 'assets/goal_clear.mp3',
    room_reveal: 'assets/room_reveal.mp3',
    ui_click: 'assets/ui_click.mp3',
    room_theme: 'assets/room_theme.mp3',
    resolve_theme: 'assets/room_reveal.mp3',
    cascade: 'assets/match_pop.mp3',
    combo: 'assets/booster_payoff.mp3',
    meta_theme: 'assets/room_reveal.mp3'
  };
  var API = {
    init: function (gk) {
      kit = gk;
      if (kit && kit.audio) kit.audio.register(FILES);
      return API;
    },
    unlock: function () {
      unlocked = true;
      if (kit && kit.audio) kit.audio.sfx('ui_click', { volume: 0.35 });
    },
    sfx: function (name, opts) { if (kit && kit.audio && unlocked) kit.audio.sfx(FILES[name] ? name : 'ui_click', opts); },
    music: function (state) {
      if (!kit || !kit.audio || !unlocked) return;
      var name = state === 'resolve' ? 'resolve_theme' : state === 'meta' ? 'meta_theme' : 'room_theme';
      kit.audio.music(name, 700);
    },
    stop: function () { if (kit && kit.audio) kit.audio.stopMusic(300); }
  };
  root.PP = root.PP || {}; root.PP.audio = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
