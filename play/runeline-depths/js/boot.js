/* Runeline Depths - boot scene.
 * Bakes every texture the title uses, registers and pre-decodes audio with
 * the GGKit buses, pre-warms the renderer, and reports real progress to the
 * GGKit loading screen. Nothing is generated after this point except the
 * layout-sized board frame and the lazily cached enemy portraits.
 */
(function (root) {
  'use strict';

  var RD = root.RD || {}; root.RD = RD;
  var Art = RD.Art;

  RD.SFX = ['ui_click', 'orb_pick', 'orb_move', 'invalid', 'match', 'cascade',
    'combo', 'heal', 'strike', 'enemy_hit', 'bind', 'shield_break',
    'room_clear', 'boss_down', 'recruit', 'evolve', 'fail'];
  RD.MUSIC = ['music_vault', 'music_deep', 'music_hall'];

  RD.BootScene = {
    key: 'boot',
    active: true,

    create: function () {
      var scene = this;
      var kit = RD.kit;
      scene.cameras.main.setZoom(RD.dpr).centerOn(RD.DESIGN_W / 2, RD.DESIGN_H / 2);
      var steps = [];

      /* ---------------------------------------------------- primitives */
      steps.push(function () {
        Art.put(scene, 'px-white', Art.bakePixel());
        Art.put(scene, 'px-spark', Art.bakeSpark());
        Art.put(scene, 'px-shard', Art.bakeShard());
        Art.put(scene, 'px-streak', Art.bakeStreak());
        Art.put(scene, 'px-dot', Art.bakeDot());
        Art.put(scene, 'px-ring', Art.bakeRing());
        Art.put(scene, 'px-vignette', Art.bakeVignette());
      });

      /* --------------------------------------------------------- cards */
      steps.push(function () {
        Art.put(scene, 'ui-chip', Art.bakeCard(160, 34, 12, 0x121C31, 0x5D7294, 0.94));
        Art.put(scene, 'ui-card', Art.bakeCard(200, 120, 14, 0x16223A, 0x5D7294, 0.95));
        Art.put(scene, 'ui-slot', Art.bakeCard(96, 96, 14, 0x1B2743, 0x7C8FB5, 0.95));
        Art.put(scene, 'ui-hud', Art.bakeCard(220, 44, 12, 0x101A2E, 0x46608C, 0.88));
      });

      /* --------------------------------------------------------- icons */
      var icons = ['pause', 'play', 'gear', 'back', 'rune', 'shield', 'sword',
        'heart', 'skull', 'lock', 'check', 'clock', 'combo', 'descent', 'roster'];
      steps.push(function () {
        icons.forEach(function (k) { Art.put(scene, 'icon-' + k, Art.bakeIcon(k, 48)); });
      });

      /* ------------------------------------------------------- depths */
      RD.DEPTHS.forEach(function (d) {
        steps.push(function () {
          Art.put(scene, 'sky-' + d.id, Art.bakeSky(d.id));
          Art.put(scene, 'mote-' + d.id, Art.bakeMote(d.id));
          Art.put(scene, 'badge-' + d.id, Art.bakeDepthBadge(d.id, 56));
          RD.ORBS.forEach(function (o) {
            Art.put(scene, 'orb-' + d.id + '-' + o.id, Art.bakeOrb(o.id, d.id, 72, false));
            Art.put(scene, 'orb-' + d.id + '-' + o.id + '-l', Art.bakeOrb(o.id, d.id, 72, true));
          });
        });
      });
      steps.push(function () {
        Art.put(scene, 'orb-bind', Art.bakeBind(72));
      });

      /* ---------------------------------------------------- portraits */
      var guards = RD.ALL_GUARDS;
      for (var gi = 0; gi < guards.length; gi += 4) {
        (function (start) {
          steps.push(function () {
            for (var i = start; i < Math.min(start + 4, guards.length); i++) {
              var id = guards[i].id;
              Art.put(scene, 'guard-' + id, Art.bakeGuard(id, 128, false));
              if (guards[i].evo) Art.put(scene, 'guard-' + id + '-e', Art.bakeGuard(id, 128, true));
            }
          });
        })(gi);
      }

      /* -------------------------------------------------------- audio */
      steps.push(function () {
        var map = {};
        RD.SFX.forEach(function (k) { map[k] = 'assets/' + k + '.mp3'; });
        kit.audio.register(map);
        /* music registers here but only loads after the first interaction */
        var mmap = {};
        RD.MUSIC.forEach(function (k) { mmap[k] = 'assets/' + k + '.mp3'; });
        kit.audio.register(mmap);
      });
      steps.push(function () {
        return kit.audio.preload(RD.SFX);
      });

      /* ------------------------------------------------------ pre-warm */
      steps.push(function () {
        /* draw one of every texture once so the first real frame has no
           upload hitch on any device */
        var warm = [];
        var keys = scene.textures.getTextureKeys();
        for (var i = 0; i < keys.length; i++) {
          if (keys[i] === '__DEFAULT' || keys[i] === '__MISSING' || keys[i] === '__WHITE') continue;
          var im = scene.add.image(-800 - i * 4, -800, keys[i]).setScale(0.02);
          warm.push(im);
        }
        scene.__warm = warm;
      });
      steps.push(function () {
        /* hold the warm sprites for two real frames so every texture is
           uploaded to the GPU before the first gameplay frame */
        return new Promise(function (res) {
          window.requestAnimationFrame(function () {
            window.requestAnimationFrame(function () {
              if (scene.__warm) {
                for (var i = 0; i < scene.__warm.length; i++) scene.__warm[i].destroy();
                scene.__warm = null;
              }
              res();
            });
          });
        });
      });

      /* -------------------------------------------------------- runner */
      var i = 0;
      function runStep() {
        if (i >= steps.length) {
          kit.loader.progress(1);
          window.setTimeout(function () {
            kit.loader.hide();
            RD.booted = true;
            /* test switches are readable from the boot fallback as well as
               from a live scene */
            if (RD.force && RD.force.mode) {
              var m = RD.force.mode, s = RD.force.stage;
              RD.force.mode = null;
              if (m === 'play' || m === 'dungeon') scene.scene.start('play', { mode: 'dungeon', dungeonId: s || 1 });
              else if (m === 'descent') scene.scene.start('play', { mode: 'descent' });
              else scene.scene.start('menu', { screen: m === 'menu' ? 'title' : m });
            } else {
              scene.scene.start('menu');
            }
          }, 60);
          return;
        }
        var r = null;
        try { r = steps[i](); } catch (e) { /* a bake failure must not brick boot */ }
        i++;
        kit.loader.progress(i / steps.length);
        if (r && typeof r.then === 'function') r.then(function () { window.setTimeout(runStep, 0); });
        else window.setTimeout(runStep, 0);
      }
      runStep();
    }
  };

  /* Enemy portraits are baked once, on first sight, and cached forever. */
  RD.foeTexture = function (scene, enemyId) {
    var key = 'foe-' + enemyId;
    if (!scene.textures.exists(key)) Art.put(scene, key, Art.bakeFoe(enemyId, 224));
    return key;
  };
})(typeof window !== 'undefined' ? window : globalThis);
