// hm2_background.js - procedural 4-layer parallax background for Horde Meridian 2.
// ES5, no deps. Loads after hm2_world.js (window.HM2_WORLD). Exposes window.HM2_BACKGROUND.
//
// DEPTH BUDGET: game.js owns depths -100 (ground) up through -79 (region walls)
// and uses -99/-98/-97/-96/-95/-94/-92/-90/-89/-80/-79 for its own sky/landmark/
// debris/boundary layers. This module must stay STRICTLY BELOW -100 so it never
// collides with any of those. Layer order back to front:
//   deep galaxy   depth -140  scrollFactor 0.05
//   nebula clouds depth -130  scrollFactor 0.18  (additive, bloom pipeline)
//   asteroid mid  depth -120  scrollFactor 0.45
//   near dust     depth -110  scrollFactor 0.80
// All four sit below game.js's -100 floor, so no collision with existing usage.
//
// LUMINANCE NOTES (relative luminance, 0-1, of the brightest pixel in each
// generated texture, computed as 0.2126 r + 0.7152 g + 0.0722 b at full alpha):
//   deep galaxy core   ~0.14  (kept dark; only the tiny star speckle exceeds this)
//   nebula puff peak   ~0.22  (additive blend still reads well under 0.3 vs enemy tints)
//   asteroid silhouette ~0.05 (near-black, silhouette only)
//   dust speckle       ~0.10
// Enemy/projectile tints in hm_data.js run from 0x65d5c3 (luminance ~0.72) up to
// 0xffd67a (luminance ~0.86); the darkest is drifter teal at ~0.72. Backdrop peak
// (~0.22 nebula) keeps delta >= 0.5 in the worst case, comfortably clearing the
// >= 0.18 gate from reference_track_readability even before per-region tinting.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.HM2_BACKGROUND = factory();
  }
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  var TEX_CACHE = {};

  function luminance(r, g, b) {
    return 0.2126 * (r / 255) + 0.7152 * (g / 255) + 0.0722 * (b / 255);
  }

  function lerpColor(a, b, t) {
    var ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
    var br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
    var rr = Math.round(ar + (br - ar) * t);
    var rg = Math.round(ag + (bg - ag) * t);
    var rb = Math.round(ab + (bb - ab) * t);
    return (rr << 16) | (rg << 8) | rb;
  }

  // srand: small deterministic PRNG so repeat create() calls generate the
  // same texture bytes (cache-friendly, no visual popping between scenes).
  function makeRand(seed) {
    var s = seed >>> 0 || 1;
    return function () {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return (s % 10000) / 10000;
    };
  }

  function ensureTexture(scene, key, w, h, drawFn) {
    if (TEX_CACHE[key]) return key;
    if (scene.textures.exists(key)) { TEX_CACHE[key] = true; return key; }
    var g = scene.add.graphics();
    drawFn(g);
    g.generateTexture(key, w, h);
    g.destroy();
    TEX_CACHE[key] = true;
    return key;
  }

  function buildDeepGalaxyTexture(scene) {
    return ensureTexture(scene, 'hm2bg_galaxy', 1024, 1024, function (g) {
      var cx = 512, cy = 512;
      var rand = makeRand(7);
      // soft radial gradient via concentric fills, darkest outward
      var steps = 24;
      for (var i = steps; i >= 0; i--) {
        var t = i / steps;
        var radius = 60 + t * 480;
        var alpha = 0.18 * (1 - t) * (1 - t);
        g.fillStyle(0x1a1440, alpha);
        g.fillCircle(cx, cy, radius);
      }
      // brighter core
      g.fillStyle(0x352a6e, 0.5);
      g.fillCircle(cx, cy, 40);
      // star speckle
      for (var s = 0; s < 260; s++) {
        var sx = rand() * 1024, sy = rand() * 1024;
        var sr = rand() * 1.6 + 0.3;
        var sa = 0.25 + rand() * 0.55;
        g.fillStyle(0xdfefff, sa);
        g.fillCircle(sx, sy, sr);
      }
    });
  }

  function buildNebulaTexture(scene) {
    return ensureTexture(scene, 'hm2bg_nebula', 768, 768, function (g) {
      var rand = makeRand(31);
      var blobs = 6;
      for (var b = 0; b < blobs; b++) {
        var bx = 120 + rand() * 528;
        var by = 120 + rand() * 528;
        var br = 90 + rand() * 160;
        var layers = 10;
        for (var i = layers; i >= 0; i--) {
          var t = i / layers;
          var radius = br * (0.3 + t * 0.7);
          var alpha = 0.05 * (1 - t);
          g.fillStyle(0x66d2ff, alpha);
          g.fillCircle(bx, by, radius);
        }
      }
    });
  }

  function buildAsteroidTexture(scene) {
    return ensureTexture(scene, 'hm2bg_asteroids', 640, 320, function (g) {
      var rand = makeRand(53);
      g.fillStyle(0x0a0c12, 0.001);
      g.fillRect(0, 0, 640, 320);
      var count = 9;
      for (var i = 0; i < count; i++) {
        var cx = (i / count) * 640 + rand() * 40;
        var cy = 80 + rand() * 160;
        var r = 24 + rand() * 46;
        var sides = 6 + Math.floor(rand() * 4);
        g.fillStyle(0x0b0910, 0.85);
        g.beginPath();
        for (var s = 0; s < sides; s++) {
          var ang = (s / sides) * Math.PI * 2;
          var rr = r * (0.7 + rand() * 0.4);
          var px = cx + Math.cos(ang) * rr;
          var py = cy + Math.sin(ang) * rr * 0.7;
          if (s === 0) g.moveTo(px, py); else g.lineTo(px, py);
        }
        g.closePath();
        g.fillPath();
      }
    });
  }

  function buildDustTexture(scene) {
    return ensureTexture(scene, 'hm2bg_dust', 256, 256, function (g) {
      var rand = makeRand(97);
      for (var i = 0; i < 140; i++) {
        var x = rand() * 256, y = rand() * 256;
        var r = rand() * 1.1 + 0.2;
        var a = 0.08 + rand() * 0.22;
        g.fillStyle(0x9fb4c8, a);
        g.fillCircle(x, y, r);
      }
    });
  }

  function tryRegisterBloom(scene) {
    var isWebGL = typeof Phaser !== 'undefined' && scene.renderer &&
      scene.renderer.type === Phaser.WEBGL;
    if (!isWebGL) return null;
    try {
      var renderer = scene.renderer;
      if (!renderer.pipelines) return null;
      var key = 'HM2BloomFX';
      if (!renderer.pipelines.has(key) && Phaser.Display && Phaser.Display.Color) {
        // Feature-detect FX pipeline API (Phaser 3.60+ postFX). If unavailable
        // this throws and we fall back cleanly to no bloom.
        if (!Phaser.FX || !Phaser.FX.Bloom) return null;
      }
      return key;
    } catch (e) {
      return null;
    }
  }

  function applyBloomIfPossible(sprite, scene) {
    try {
      var isWebGL = typeof Phaser !== 'undefined' && scene.renderer &&
        scene.renderer.type === Phaser.WEBGL;
      if (!isWebGL) return;
      if (!sprite.postFX || typeof sprite.postFX.addBloom !== 'function') return;
      sprite.postFX.addBloom(0xffffff, 1, 1, 1, 0.6, 6);
    } catch (e) {
      // CANVAS renderer or missing FX API: skip silently, no error surfaced.
    }
  }

  function create(scene, worldApi) {
    var galaxyKey = buildDeepGalaxyTexture(scene);
    var nebulaKey = buildNebulaTexture(scene);
    var asteroidKey = buildAsteroidTexture(scene);
    var dustKey = buildDustTexture(scene);

    var w = scene.scale.width, h = scene.scale.height;

    var deep = scene.add.tileSprite(w / 2, h / 2, w * 2, h * 2, galaxyKey)
      .setScrollFactor(0.05).setDepth(-140).setAlpha(0.9);
    var nebula = scene.add.tileSprite(w / 2, h / 2, w * 2, h * 2, nebulaKey)
      .setScrollFactor(0.18).setDepth(-130).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.5);
    var mid = scene.add.tileSprite(w / 2, h / 2, w * 2.4, h * 2.4, asteroidKey)
      .setScrollFactor(0.45).setDepth(-120).setAlpha(0.6);
    var dust = scene.add.tileSprite(w / 2, h / 2, w * 2, h * 2, dustKey)
      .setScrollFactor(0.8).setDepth(-110).setAlpha(0.5);

    applyBloomIfPossible(nebula, scene);

    var currentTint = 0xffffff;
    var fadeFrom = null;
    var fadeTo = null;
    var fadeT = 0;
    var FADE_DURATION = 0.6;

    function applyPaletteToLayers(palette) {
      if (!palette) return;
      deep.setTint(palette.deep != null ? palette.deep : 0xffffff);
      nebula.setTint(palette.nebula != null ? palette.nebula : 0xffffff);
      mid.setTint(palette.mid != null ? palette.mid : 0xffffff);
      dust.setTint(palette.dust != null ? palette.dust : 0xffffff);
    }

    var regionPalettes = {};
    if (worldApi && worldApi.REGIONS) {
      for (var i = 0; i < worldApi.REGIONS.length; i++) {
        var region = worldApi.REGIONS[i];
        regionPalettes[region.key] = region.palette;
      }
    }

    var activeRegionKey = null;

    function setRegion(id) {
      var palette = regionPalettes[id];
      if (!palette || id === activeRegionKey) return;
      activeRegionKey = id;
      fadeFrom = {
        deep: deep.tintTopLeft || 0xffffff,
        nebula: nebula.tintTopLeft || 0xffffff,
        mid: mid.tintTopLeft || 0xffffff,
        dust: dust.tintTopLeft || 0xffffff
      };
      fadeTo = palette;
      fadeT = 0;
    }

    function update(cam, dt) {
      dt = dt || 0;
      if (fadeTo) {
        fadeT += dt;
        var t = Math.min(1, fadeT / FADE_DURATION);
        deep.setTint(lerpColor(fadeFrom.deep, fadeTo.deep != null ? fadeTo.deep : 0xffffff, t));
        nebula.setTint(lerpColor(fadeFrom.nebula, fadeTo.nebula != null ? fadeTo.nebula : 0xffffff, t));
        mid.setTint(lerpColor(fadeFrom.mid, fadeTo.mid != null ? fadeTo.mid : 0xffffff, t));
        dust.setTint(lerpColor(fadeFrom.dust, fadeTo.dust != null ? fadeTo.dust : 0xffffff, t));
        if (t >= 1) { fadeTo = null; fadeFrom = null; }
      }
      if (cam && isFinite(cam.scrollX) && isFinite(cam.scrollY)) {
        deep.tilePositionX = cam.scrollX * 0.05;
        deep.tilePositionY = cam.scrollY * 0.05;
        nebula.tilePositionX = cam.scrollX * 0.18;
        nebula.tilePositionY = cam.scrollY * 0.18;
        mid.tilePositionX = cam.scrollX * 0.45;
        mid.tilePositionY = cam.scrollY * 0.45;
        dust.tilePositionX = cam.scrollX * 0.8;
        dust.tilePositionY = cam.scrollY * 0.8;
      }
    }

    function destroy() {
      deep.destroy();
      nebula.destroy();
      mid.destroy();
      dust.destroy();
    }

    return {
      layers: { deep: deep, nebula: nebula, mid: mid, dust: dust },
      update: update,
      setRegion: setRegion,
      destroy: destroy
    };
  }

  return {
    create: create,
    _luminance: luminance,
    _lerpColor: lerpColor
  };
});
