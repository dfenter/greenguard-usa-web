/* Driftlands — procedural art build.
 *
 * Everything the game draws is baked once, on the loading screen, into three
 * GPU textures so gameplay never allocates a texture and the renderer can
 * batch almost the whole frame:
 *
 *   terrain  16x16 tilemap atlas: five authored biome families, 16-way
 *            transition sets with cliff shading, animated water, animated
 *            shore foam, animated grass, and three distinct dungeon moods.
 *   dl       entity/UI atlas: drifter, six enemy sheets with idle / walk /
 *            attack / hurt / defeat states, landmark props, particles and
 *            every pixel UI part. One texture means one draw batch.
 *   pixfont  fixed cell bitmap font used by the HUD and every panel, so no
 *            system-font Text object is measured or uploaded at runtime.
 *
 * Kenney tiny-town / tiny-dungeon CC0 tiles are used only as source geometry
 * for terrain grain; every shipped pixel is recoloured into the Driftlands
 * ramp so nothing borrows a foreign palette. See LICENSES.md.
 */
(function (root) {
  'use strict';

  var T = 16;
  var DL = root.DL || (root.DL = {});

  /* ------------------------------------------------------------- palettes */
  var PAL = {
    shallow: ['#12455e', '#1d6b7d', '#2f97a0', '#7ed3cf'],
    deep:    ['#0a2f43', '#0f3f57', '#17546e', '#256f88'],
    sand:    ['#8a6a3f', '#c39a5e', '#e2c48b', '#f6e5bb'],
    grass:   ['#2b5c37', '#3e8945', '#5cae52', '#8bd074'],
    forest:  ['#123326', '#1c4a2e', '#2a6a3c', '#3f8c4a'],
    rock:    ['#3a4550', '#5a6772', '#8894a0', '#b5c1c8'],
    ruin:    ['#382f47', '#544862', '#7a6b85', '#a99bb0'],
    foam:    ['#8fd7d2', '#bdeeea', '#e6fbf7']
  };

  // Three authored dungeon moods. Index matches the gauntlet index.
  var DUN = [
    { name: 'ember',  floor: ['#3c2519', '#6d4126', '#a4693a', '#d9a266'], wall: ['#241521', '#3d2431', '#5e3a45', '#8a5a5c'], accent: 0xff9a5c, fog: 0x1a0f12 },
    { name: 'tide',   floor: ['#12313b', '#1c4c58', '#2a7180', '#4aa2ab'], wall: ['#0e1f2c', '#183345', '#264c62', '#3c7189'], accent: 0x6fe3d6, fog: 0x081820 },
    { name: 'hollow', floor: ['#2a2438', '#413655', '#5f4f7a', '#8c79a8'], wall: ['#1a1626', '#2a2340', '#3e355c', '#5d5182'], accent: 0xc79bff, fog: 0x120e1c }
  ];

  function hex(h) {
    return [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)];
  }
  function rgb(c) { return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')'; }
  function ramp(list) {
    var cols = list.map(hex), n = cols.length - 1;
    return function (r, g, b) {
      var l = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      var i = Math.round(l * n);
      return cols[i < 0 ? 0 : i > n ? n : i];
    };
  }
  function noise(x, y, s) {
    var n = (Math.imul(x + 31, 374761393) ^ Math.imul(y + 71, 668265263) ^ (s * 2654435761)) >>> 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177) >>> 0;
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  }
  function cv(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var g = c.getContext('2d', { willReadFrequently: true });
    g.imageSmoothingEnabled = false;
    return { c: c, g: g };
  }

  /* ====================================================== TERRAIN ATLAS === */
  function buildTerrain(scene) {
    var town = scene.textures.get('town').getSourceImage();
    var dung = scene.textures.get('dungeon').getSourceImage();
    // 16 x 12 slots holds all 166 baked tiles. The atlas is re-uploaded every
    // water frame, so every unused row is dead upload bandwidth: 256x192
    // instead of 256x256 is a quarter off the per-cycle texture cost.
    var COLS = 16, ROWS = 12;
    var at = cv(COLS * T, ROWS * T);
    var sc = cv(T, T);
    var mk = cv(T, T);
    var next = 0;
    var IDX = {};
    var animSlots = [], animFrames = [];

    function blit(i) { at.g.drawImage(sc.c, (i % COLS) * T, Math.floor(i / COLS) * T); }
    function put(i, canvas) {
      var dx = (i % COLS) * T, dy = Math.floor(i / COLS) * T;
      at.g.clearRect(dx, dy, T, T);
      at.g.drawImage(canvas, dx, dy);
    }
    function clear() { sc.g.clearRect(0, 0, T, T); }
    function srcTile(img, frame) {
      var c = frame % 12, r = Math.floor(frame / 12);
      sc.g.drawImage(img, c * T, r * T, T, T, 0, 0, T, T);
    }
    function recolor(list) {
      var f = ramp(list);
      var d = sc.g.getImageData(0, 0, T, T), p = d.data;
      for (var i = 0; i < p.length; i += 4) {
        if (p[i + 3] < 8) continue;
        var c = f(p[i], p[i + 1], p[i + 2]);
        p[i] = c[0]; p[i + 1] = c[1]; p[i + 2] = c[2];
      }
      sc.g.putImageData(d, 0, 0);
    }
    function dot(g, x, y, c) { g.fillStyle = c; g.fillRect(x, y, 1, 1); }
    function bar(g, x, y, w, h, c) { g.fillStyle = c; g.fillRect(x, y, w, h); }

    /* -- biome families ---------------------------------------------------
     * Each family is authored from its own generator so grass, forest, rock,
     * ruin and beach carry different motifs, value structure and prop
     * density instead of one recoloured source tile.
     */

    // Beach: fine wind-blown grain with ripple ridges and shell litter.
    function drawSand(g, sd, variant) {
      var p = PAL.sand;
      bar(g, 0, 0, T, T, p[2]);
      for (var y = 0; y < T; y++) for (var x = 0; x < T; x++) {
        var n = noise(x, y, sd);
        if (n > 0.86) dot(g, x, y, p[3]);
        else if (n < 0.12) dot(g, x, y, p[1]);
      }
      // ripple ridges run with the tide line
      for (var r = 0; r < 3; r++) {
        var yy = 2 + r * 5 + ((noise(r, sd, 5) * 2) | 0);
        for (var x2 = 0; x2 < T; x2++) {
          var off = Math.round(Math.sin((x2 + sd * 3) * 0.55 + r) * 1.2);
          dot(g, x2, (yy + off + T) % T, p[3]);
          dot(g, x2, (yy + off + 1 + T) % T, p[1]);
        }
      }
      if (variant === 1) { // shells
        bar(g, 5, 8, 3, 2, '#fdf3df'); dot(g, 6, 7, '#fdf3df');
        bar(g, 10, 11, 2, 1, '#e8c9a0');
      }
      if (variant === 2) { // driftwood
        bar(g, 3, 10, 9, 2, '#8a6a3f'); bar(g, 3, 10, 9, 1, '#b08a55');
        dot(g, 12, 11, '#6f5231');
      }
    }

    // Grass: clumped blades over a mounded value field. Nothing like forest.
    function drawGrass(g, sd, variant) {
      var p = PAL.grass;
      bar(g, 0, 0, T, T, p[1]);
      for (var y = 0; y < T; y++) for (var x = 0; x < T; x++) {
        var v = Math.sin((x + sd) * 0.5) * 0.5 + Math.cos((y - sd) * 0.42) * 0.5 + noise(x, y, sd) * 0.6;
        if (v > 0.55) dot(g, x, y, p[2]);
        else if (v < -0.5) dot(g, x, y, p[0]);
      }
      var blades = variant === 1 ? 7 : 4;
      for (var b = 0; b < blades; b++) {
        var bx = 1 + ((noise(b, sd, 11) * 14) | 0), by = 4 + ((noise(b, sd, 12) * 10) | 0);
        var hgt = 2 + ((noise(b, sd, 13) * 3) | 0);
        for (var k = 0; k < hgt; k++) dot(g, bx, by - k, k === hgt - 1 ? p[3] : p[2]);
        dot(g, bx + 1, by, p[0]);
      }
      if (variant === 2) { // small flowers
        dot(g, 4, 9, '#f4e6a8'); dot(g, 5, 9, '#e8c86a'); dot(g, 11, 5, '#f4e6a8');
      }
    }

    // Forest: dense canopy scallops with trunk shadow gaps. Own geometry.
    function drawForest(g, sd, variant) {
      var p = PAL.forest;
      bar(g, 0, 0, T, T, p[0]);
      // three overlapping canopy lobes
      var lobes = [[4, 5, 5], [11, 6, 4], [8, 12, 5]];
      for (var i = 0; i < lobes.length; i++) {
        var cx = lobes[i][0] + (noise(i, sd, 3) * 2 | 0) - 1;
        var cy = lobes[i][1] + (noise(i, sd, 4) * 2 | 0) - 1;
        var rr = lobes[i][2];
        for (var y = -rr; y <= rr; y++) for (var x = -rr; x <= rr; x++) {
          var px = cx + x, py = cy + y;
          if (px < 0 || py < 0 || px >= T || py >= T) continue;
          var d = (x * x) / (rr * rr) + (y * y) / (rr * rr * 0.85);
          if (d > 1) continue;
          dot(g, px, py, d > 0.72 ? p[1] : y < -1 ? p[3] : p[2]);
        }
      }
      // leaf speckle keeps the canopy from reading flat
      for (var y2 = 0; y2 < T; y2++) for (var x2 = 0; x2 < T; x2++) {
        if (noise(x2, y2, sd + 40) > 0.93) dot(g, x2, y2, p[3]);
      }
      if (variant === 1) { bar(g, 7, 12, 2, 4, '#33241a'); bar(g, 7, 12, 1, 4, '#4a3524'); }
      if (variant === 2) { dot(g, 3, 13, '#c96a5a'); dot(g, 4, 13, '#c96a5a'); dot(g, 12, 3, '#c96a5a'); }
    }

    // Rock: fractured slabs with a lit top facet and a cast shadow lip.
    function drawRock(g, sd, variant) {
      var p = PAL.rock;
      bar(g, 0, 0, T, T, p[1]);
      var seams = 3 + (variant === 1 ? 2 : 0);
      for (var s = 0; s < seams; s++) {
        var sx = ((noise(s, sd, 21) * T) | 0);
        var sy = ((noise(s, sd, 22) * T) | 0);
        var horiz = noise(s, sd, 23) > 0.5;
        for (var k = 0; k < T; k++) {
          var x = horiz ? k : sx + Math.round(Math.sin(k * 0.6 + s) * 1.4);
          var y = horiz ? sy + Math.round(Math.sin(k * 0.5 + s) * 1.4) : k;
          if (x < 0 || y < 0 || x >= T || y >= T) continue;
          dot(g, x, y, p[0]);
          if (y + 1 < T) dot(g, x, y + 1, p[2]);
        }
      }
      for (var y2 = 0; y2 < T; y2++) for (var x2 = 0; x2 < T; x2++) {
        var n = noise(x2, y2, sd + 60);
        if (n > 0.9) dot(g, x2, y2, p[3]);
      }
      if (variant === 2) { // boulder
        for (var yy = -3; yy <= 3; yy++) for (var xx = -4; xx <= 4; xx++) {
          if ((xx * xx) / 16 + (yy * yy) / 9 > 1) continue;
          dot(g, 7 + xx, 8 + yy, (xx * xx) / 16 + (yy * yy) / 9 > 0.62 ? p[0] : yy < 0 ? p[3] : p[2]);
        }
      }
    }

    // Ruin: laid flagstones with carved channels and drift-glyph inlays.
    function drawRuin(g, sd, variant) {
      var p = PAL.ruin;
      bar(g, 0, 0, T, T, p[1]);
      for (var ry = 0; ry < 2; ry++) for (var rx = 0; rx < 2; rx++) {
        var ox = rx * 8, oy = ry * 8;
        var shade = noise(rx, ry, sd) > 0.5 ? p[2] : p[1];
        bar(g, ox + 1, oy + 1, 6, 6, shade);
        bar(g, ox + 1, oy + 1, 6, 1, p[3]);
        bar(g, ox + 1, oy + 6, 6, 1, p[0]);
      }
      bar(g, 0, 0, T, 1, p[0]); bar(g, 0, 8, T, 1, p[0]);
      bar(g, 0, 0, 1, T, p[0]); bar(g, 8, 0, 1, T, p[0]);
      if (variant === 1) { // carved drift glyph
        bar(g, 6, 4, 4, 1, '#c8b6d8'); bar(g, 7, 4, 1, 8, '#c8b6d8');
        bar(g, 5, 11, 6, 1, '#c8b6d8');
      }
      if (variant === 2) { // broken pillar stump
        bar(g, 5, 3, 6, 10, p[0]); bar(g, 6, 4, 4, 8, p[2]); bar(g, 6, 4, 2, 8, p[3]);
        bar(g, 4, 12, 8, 2, p[0]);
      }
    }

    // Transparent prop tiles: canopy crowns, brush and shore litter that sit
    // on the props layer above the ground family without hiding it.
    function drawTreeProp(g, sd, kind) {
      var p = PAL.forest;
      if (kind === 0) { // broad canopy
        for (var y = -5; y <= 4; y++) for (var x = -6; x <= 6; x++) {
          var d = (x * x) / 36 + (y * y) / 25;
          if (d > 1) continue;
          dot(g, 8 + x, 7 + y, d > 0.7 ? p[1] : y < -1 ? p[3] : p[2]);
        }
        bar(g, 7, 11, 2, 5, '#4a3524'); bar(g, 7, 11, 1, 5, '#6b4c30');
      } else if (kind === 1) { // narrow pine
        for (var k = 0; k < 5; k++) {
          var w = 2 + k * 2;
          bar(g, 8 - (w >> 1), 3 + k * 2, w, 2, k % 2 ? p[2] : p[1]);
        }
        bar(g, 7, 13, 2, 3, '#4a3524');
      } else { // fallen log with sprouts
        bar(g, 2, 9, 12, 4, '#4a3524'); bar(g, 2, 9, 12, 1, '#6b4c30');
        dot(g, 4, 8, p[3]); dot(g, 9, 8, p[3]); dot(g, 11, 8, p[2]);
      }
    }
    function drawBrushProp(g, sd, kind) {
      var p = PAL.grass;
      if (kind === 0) {
        for (var b = 0; b < 6; b++) {
          var bx = 3 + ((noise(b, sd, 31) * 10) | 0), by = 9 + ((noise(b, sd, 32) * 4) | 0);
          for (var k = 0; k < 4; k++) dot(g, bx, by - k, k === 3 ? p[3] : p[2]);
        }
      } else {
        for (var y = -3; y <= 2; y++) for (var x = -4; x <= 4; x++) {
          if ((x * x) / 16 + (y * y) / 9 > 1) continue;
          dot(g, 8 + x, 11 + y, y < 0 ? p[3] : p[1]);
        }
        dot(g, 6, 8, '#e8c86a'); dot(g, 10, 9, '#e8c86a');
      }
    }
    function drawShoreProp(g, sd, kind) {
      if (kind === 0) {
        bar(g, 4, 9, 4, 2, '#fdf3df'); dot(g, 5, 8, '#fdf3df'); dot(g, 9, 11, '#e8c9a0');
      } else {
        bar(g, 2, 10, 11, 2, '#8a6a3f'); bar(g, 2, 10, 11, 1, '#b08a55');
        dot(g, 13, 11, '#6f5231'); dot(g, 5, 9, '#b08a55');
      }
    }
    function propSet(name, count, draw) {
      var arr = [];
      for (var i = 0; i < count; i++) {
        clear();
        draw(sc.g, 5 + i * 17, i);
        var id = next++; blit(id); arr.push(id);
      }
      IDX[name] = arr;
    }

    var BIOME = { sand: drawSand, grass: drawGrass, forest: drawForest, rock: drawRock, ruin: drawRuin };

    function baseSet(name, count) {
      var arr = [];
      for (var i = 0; i < count; i++) {
        clear();
        BIOME[name](sc.g, 7 + i * 13, i % 3);
        var id = next++; blit(id); arr.push(id);
      }
      IDX[name] = arr;
      return arr;
    }
    baseSet('sand', 6);
    baseSet('grass', 6);
    baseSet('forest', 6);
    baseSet('rock', 6);
    baseSet('ruin', 6);
    propSet('propForest', 3, drawTreeProp);
    propSet('propGrass', 2, drawBrushProp);
    propSet('propSand', 2, drawShoreProp);

    // grain lifted from the CC0 source geometry keeps the tiles from reading
    // purely mathematical; blended at low alpha over the authored families.
    (function grain() {
      var frames = [0, 1, 2, 40, 41, 42];
      var names = ['grass', 'forest', 'rock', 'ruin', 'sand'];
      var srcImg = [town, town, dung, dung, town];
      for (var n = 0; n < names.length; n++) {
        var set = IDX[names[n]];
        for (var i = 0; i < set.length; i++) {
          clear();
          srcTile(srcImg[n], frames[(i + n) % frames.length]);
          recolor(PAL[names[n]]);
          var dx = (set[i] % COLS) * T, dy = Math.floor(set[i] / COLS) * T;
          at.g.save();
          at.g.globalAlpha = 0.22;
          at.g.drawImage(sc.c, dx, dy);
          at.g.restore();
        }
      }
    })();

    /* -- animated water ---------------------------------------------------
     * Deep water, shallow shelf and foam all cycle. The animator blits the
     * current frame of every animated slot into the atlas, so one small
     * texture upload animates every water tile on screen.
     */
    function waterFrame(deep, slot, f) {
      var fc = cv(T, T);
      var pal = deep ? PAL.deep : PAL.shallow;
      for (var y = 0; y < T; y++) for (var x = 0; x < T; x++) {
        var ph = x * 0.62 + y * 0.44 + slot * 3.1 + f * (Math.PI / 2);
        var v = Math.sin(ph) * 0.5 + Math.cos(ph * 0.6 + y * 0.3) * 0.5;
        var n2 = noise(x, y, (deep ? 200 : 260) + slot);
        var col = v + n2 * 0.4 > 1.05 ? pal[3] : v > 0.55 ? pal[2] : v > -0.3 ? pal[1] : pal[0];
        dot(fc.g, x, y, col);
      }
      // glint highlights drift across the surface
      var gx = ((f * 4 + slot * 5) % T);
      dot(fc.g, gx, (slot * 5 + 3) % T, pal[3]);
      dot(fc.g, (gx + 1) % T, (slot * 5 + 3) % T, pal[3]);
      return fc.c;
    }
    function waterSet(name, deep) {
      IDX[name] = [];
      for (var s = 0; s < 3; s++) {
        var frames = [];
        for (var f = 0; f < 4; f++) frames.push(waterFrame(deep, s, f));
        var id = next++;
        put(id, frames[0]);
        IDX[name].push(id);
        animSlots.push(id); animFrames.push(frames);
      }
    }
    waterSet('water', true);
    waterSet('shallow', false);

    /* -- 16-way transition sets ------------------------------------------
     * A full side / outer-corner / inner-corner set. The higher terrain
     * spills over the neighbour with a hand-shaped scallop rather than a
     * straight cut, and every set carries a one pixel dark contact line so
     * cliffs and shorelines read as elevation rather than a seam.
     */
    function scallop(m, sd) {
      // returns a mask canvas: 1 where the higher terrain covers this tile
      mk.g.clearRect(0, 0, T, T);
      mk.g.fillStyle = '#fff';
      var depth = function (i, side) {
        return 4 + Math.round(Math.sin(i * 0.9 + side * 2.1 + sd) * 1.6) + ((noise(i, side, sd) * 2) | 0);
      };
      for (var x = 0; x < T; x++) {
        if (m & 1) { var dN = depth(x, 0); mk.g.fillRect(x, 0, 1, dN); }
        if (m & 4) { var dS = depth(x, 1); mk.g.fillRect(x, T - dS, 1, dS); }
      }
      for (var y = 0; y < T; y++) {
        if (m & 2) { var dE = depth(y, 2); mk.g.fillRect(T - dE, y, dE, 1); }
        if (m & 8) { var dW = depth(y, 3); mk.g.fillRect(0, y, dW, 1); }
      }
      return mk.c;
    }

    function edges(name, sd, cliff) {
      var arr = [];
      var src = IDX[name][0];
      for (var m = 0; m < 16; m++) {
        if (m === 0) { arr.push(-1); continue; }
        clear();
        sc.g.drawImage(at.c, (src % COLS) * T, Math.floor(src / COLS) * T, T, T, 0, 0, T, T);
        var mask = scallop(m, sd);
        sc.g.globalCompositeOperation = 'destination-in';
        sc.g.drawImage(mask, 0, 0);
        sc.g.globalCompositeOperation = 'source-over';
        // contact line + cliff face shading along the exposed lower edge
        var d = sc.g.getImageData(0, 0, T, T), p = d.data;
        var solid = new Uint8Array(T * T);
        for (var i = 0; i < T * T; i++) solid[i] = p[i * 4 + 3] > 8 ? 1 : 0;
        for (var y = 0; y < T; y++) for (var x = 0; x < T; x++) {
          var k = y * T + x;
          if (!solid[k]) continue;
          var below = y + 1 < T ? solid[(y + 1) * T + x] : 1;
          var right = x + 1 < T ? solid[k + 1] : 1;
          var left = x > 0 ? solid[k - 1] : 1;
          if (!below || !right || !left) {
            p[k * 4] = (p[k * 4] * 0.42) | 0;
            p[k * 4 + 1] = (p[k * 4 + 1] * 0.42) | 0;
            p[k * 4 + 2] = (p[k * 4 + 2] * 0.5) | 0;
          } else if (cliff && y + 2 < T && !solid[(y + 2) * T + x]) {
            p[k * 4] = (p[k * 4] * 0.68) | 0;
            p[k * 4 + 1] = (p[k * 4 + 1] * 0.68) | 0;
            p[k * 4 + 2] = (p[k * 4 + 2] * 0.74) | 0;
          }
        }
        sc.g.putImageData(d, 0, 0);
        var id = next++; blit(id); arr.push(id);
      }
      IDX[name + 'Edge'] = arr;
    }
    edges('sand', 7, false);
    edges('grass', 17, false);
    edges('forest', 27, true);
    edges('rock', 37, true);
    edges('ruin', 47, true);

    /* -- animated shore foam --------------------------------------------- */
    function foamFrame(m, f) {
      var fc = cv(T, T);
      for (var y = 0; y < T; y++) for (var x = 0; x < T; x++) {
        var d = 99;
        if (m & 1) d = Math.min(d, y);
        if (m & 4) d = Math.min(d, T - 1 - y);
        if (m & 2) d = Math.min(d, T - 1 - x);
        if (m & 8) d = Math.min(d, x);
        if (d > 5) continue;
        var drift = Math.sin((x + y * 0.5) * 0.7 + f * 1.57) * 1.1;
        var n = noise(x, y, 300 + m + f * 7);
        var band = d - drift;
        if (band < 1 + n * 1.4) dot(fc.g, x, y, PAL.foam[2]);
        else if (band < 2.6 + n * 1.6) dot(fc.g, x, y, PAL.foam[1]);
        else if (band < 4 + n * 1.2) dot(fc.g, x, y, PAL.foam[0]);
      }
      return fc.c;
    }
    IDX.foam = [];
    for (var fm = 0; fm < 16; fm++) {
      if (fm === 0) { IDX.foam.push(-1); continue; }
      var ff = [];
      for (var fi = 0; fi < 4; fi++) ff.push(foamFrame(fm, fi));
      var fid = next++;
      put(fid, ff[0]);
      IDX.foam.push(fid);
      animSlots.push(fid); animFrames.push(ff);
    }

    /* -- animated grass sway ---------------------------------------------
     * Three sway slots replace three of the static grass variants, so the
     * open field carries secondary motion without any per-tile object.
     */
    IDX.grassSway = [];
    for (var gs = 0; gs < 3; gs++) {
      var gf = [];
      for (var gi = 0; gi < 4; gi++) {
        var gc = cv(T, T);
        drawGrass(gc.g, 7 + gs * 13, gs % 3);
        // shift the blade highlights by the sway phase
        var d2 = gc.g.getImageData(0, 0, T, T), pp = d2.data;
        var shift = [0, 1, 0, -1][gi];
        var copy = new Uint8ClampedArray(pp);
        for (var y3 = 0; y3 < T; y3++) for (var x3 = 0; x3 < T; x3++) {
          var sxp = ((x3 - (y3 < 9 ? shift : 0)) + T) % T;
          var a = (y3 * T + x3) * 4, b = (y3 * T + sxp) * 4;
          pp[a] = copy[b]; pp[a + 1] = copy[b + 1]; pp[a + 2] = copy[b + 2]; pp[a + 3] = copy[b + 3];
        }
        gc.g.putImageData(d2, 0, 0);
        gf.push(gc.c);
      }
      var gid = next++;
      put(gid, gf[0]);
      IDX.grassSway.push(gid);
      animSlots.push(gid); animFrames.push(gf);
    }

    /* -- three dungeon moods --------------------------------------------- */
    IDX.dun = [];
    for (var di = 0; di < DUN.length; di++) {
      var mood = DUN[di];
      var floors = [], walls = [], props = [];
      for (var fdx = 0; fdx < 4; fdx++) {
        clear();
        var fp = mood.floor;
        bar(sc.g, 0, 0, T, T, fp[1]);
        for (var yy2 = 0; yy2 < T; yy2++) for (var xx2 = 0; xx2 < T; xx2++) {
          var n3 = noise(xx2, yy2, 700 + di * 9 + fdx);
          if (n3 > 0.88) dot(sc.g, xx2, yy2, fp[2]);
          else if (n3 < 0.1) dot(sc.g, xx2, yy2, fp[0]);
        }
        // slab joints differ per mood: ember = hexes, tide = planks, hollow = spiral
        if (di === 0) {
          bar(sc.g, 0, 7, T, 1, fp[0]); bar(sc.g, 7, 0, 1, 8, fp[0]); bar(sc.g, 3, 8, 1, 8, fp[0]);
          bar(sc.g, 0, 8, T, 1, fp[2]);
        } else if (di === 1) {
          for (var pk = 0; pk < 4; pk++) { bar(sc.g, 0, pk * 4, T, 1, fp[0]); bar(sc.g, 0, pk * 4 + 1, T, 1, fp[2]); }
        } else {
          for (var sp = 0; sp < 14; sp++) {
            var an = sp * 0.8 + fdx, rr2 = 1 + sp * 0.5;
            dot(sc.g, (8 + Math.cos(an) * rr2) | 0, (8 + Math.sin(an) * rr2) | 0, fp[0]);
          }
        }
        if (fdx === 3) { bar(sc.g, 5, 5, 6, 6, fp[3]); bar(sc.g, 6, 6, 4, 4, fp[2]); }
        var idf = next++; blit(idf); floors.push(idf);
      }
      for (var wdx = 0; wdx < 4; wdx++) {
        clear();
        var wp = mood.wall;
        bar(sc.g, 0, 0, T, T, wp[1]);
        // masonry courses, offset per mood
        var course = di === 0 ? 5 : di === 1 ? 4 : 8;
        for (var cy = 0; cy < T; cy += course) {
          bar(sc.g, 0, cy, T, 1, wp[0]);
          bar(sc.g, 0, cy + 1, T, 1, wp[2]);
          var jx = ((cy / course) % 2 ? 4 : 11) + wdx;
          bar(sc.g, jx % T, cy, 1, course, wp[0]);
        }
        for (var yy3 = 0; yy3 < T; yy3++) for (var xx3 = 0; xx3 < T; xx3++) {
          if (noise(xx3, yy3, 800 + di * 7 + wdx) > 0.93) dot(sc.g, xx3, yy3, wp[3]);
        }
        if (wdx === 2) { // wall lamp / crystal, motivates the light
          bar(sc.g, 6, 4, 4, 6, wp[0]);
          var ac = '#' + ('000000' + mood.accent.toString(16)).slice(-6);
          bar(sc.g, 7, 5, 2, 4, ac);
          dot(sc.g, 7, 5, '#ffffff');
        }
        var idw2 = next++; blit(idw2); walls.push(idw2);
      }
      // floor props: rubble, brazier base, grate
      for (var pdx = 0; pdx < 2; pdx++) {
        clear();
        var pp2 = mood.floor;
        if (pdx === 0) {
          bar(sc.g, 4, 9, 8, 4, pp2[0]); bar(sc.g, 5, 8, 6, 2, pp2[2]); dot(sc.g, 6, 8, pp2[3]);
        } else {
          bar(sc.g, 3, 3, 10, 10, mood.wall[0]);
          for (var q = 0; q < 4; q++) bar(sc.g, 4 + q * 2, 4, 1, 8, mood.wall[2]);
        }
        var idp = next++; blit(idp); props.push(idp);
      }
      IDX.dun.push({ floor: floors, wall: walls, props: props, accent: mood.accent, fog: mood.fog, name: mood.name });
    }
    // legacy aliases used by the room painter
    IDX.dfloor = IDX.dun[0].floor;
    IDX.dwall = IDX.dun[0].wall;

    IDX.animate = function (frame) {
      var f = frame & 3;
      for (var i = 0; i < animSlots.length; i++) {
        var idx = animSlots[i];
        var dx = (idx % COLS) * T, dy = Math.floor(idx / COLS) * T;
        at.g.clearRect(dx, dy, T, T);
        at.g.drawImage(animFrames[i][f], dx, dy);
      }
    };
    IDX.tileCount = next;

    scene.textures.addCanvas('terrain', at.c);
    return IDX;
  }

  /* ======================================================= ENTITY ATLAS === */
  /* Authored 16x16 pixel maps. A base pose per character is hand-drawn; the
   * idle / walk / attack / hurt / defeat states are derived from it with
   * pixel-space transforms, which keeps every state on-model and on-palette.
   */
  var DOWN = [
    '................',
    '................',
    '.....oooooo.....',
    '....ohhhhhho....',
    '...ohhhhhhhho...',
    '...ohssssssho...',
    '...ohsessesho...',
    '...ohssssssho...',
    '....ossssso.....',
    '...occcccco.....',
    '..osccccccso....',
    '..osccccccso....',
    '...obbbbbbo.....',
    '...occoocco.....',
    '...okkookko.....',
    '...ooo..ooo.....'
  ];
  var UP = [
    '................',
    '................',
    '.....oooooo.....',
    '....ohhhhhho....',
    '...ohhhhhhhho...',
    '...ohhhhhhhho...',
    '...ohhwwwwhho...',
    '...ohhhhhhhho...',
    '....ohhhhho.....',
    '...occcccco.....',
    '..osccccccso....',
    '..osccccccso....',
    '...obbbbbbo.....',
    '...occoocco.....',
    '...okkookko.....',
    '...ooo..ooo.....'
  ];
  var SIDE = [
    '................',
    '................',
    '....oooooo......',
    '...ohhhhhho.....',
    '...ohhhhhhho....',
    '...ohsssssho....',
    '...ohsesssho....',
    '...ohsssssho....',
    '....ohsssho.....',
    '....occccco.....',
    '...occccccso....',
    '...occccccso....',
    '....obbbbbo.....',
    '....occccco.....',
    '....okkkko......',
    '....oooooo......'
  ];
  var DRIFTER_PAL = {
    o: '#20242e', h: '#2f7d6d', s: '#e8b98b', e: '#20242e', w: '#3f9b86',
    c: '#e6d3a4', b: '#8a5a34', k: '#5b4029'
  };

  // Enemies. Every palette is drawn from the island ramp so nothing borrows
  // a foreign accent; red and pink are reserved for damage feedback only.
  var MOSSLING = [
    '................',
    '................',
    '.......gg.......',
    '......gllg......',
    '.....oggggo.....',
    '....ommmmmmo....',
    '...ommMMMMmmo...',
    '...omMMMMMMmo...',
    '..ommMeMMeMmmo..',
    '..omMMMMMMMMmo..',
    '..omMMwwwwMMmo..',
    '..ommMMMMMMmmo..',
    '...ommmmmmmmo...',
    '....o.oo.oo.....',
    '....okko.okko...',
    '.....oo...oo....'
  ];
  var MOSS_PAL = { o: '#12291c', m: '#2a6a3c', M: '#4f9a52', l: '#8bd074', g: '#2b5c37', e: '#f2ffe4', w: '#1c4a2e', k: '#1a3a24' };

  var SKITTER = [
    '................',
    '................',
    '..o..........o..',
    '.oco........oco.',
    '.occo......occo.',
    '..occo....occo..',
    '...ooooooooooo..',
    '..occCCCCCCcco..',
    '.occCCCCCCCCcco.',
    '.ocCeCCCCCCeCco.',
    '.ocCCCCCCCCCCco.',
    '.occCCCCCCCCcco.',
    '..occcccccccco..',
    '...o.o.o.o.o....',
    '..ok.ok.ok.ok...',
    '................'
  ];
  var SKIT_PAL = { o: '#5b3a1c', c: '#c39a5e', C: '#e2c48b', e: '#20242e', k: '#8a6a3f' };

  var BRUTE = [
    '................',
    '.....oooooo.....',
    '....orrrrrro....',
    '...orRRRRRRro...',
    '...orReRRReRo...',
    '...orRRRRRRro...',
    '...oorRRRRroo...',
    '..oorrrRRrrroo..',
    '.oorRRRRRRRRroo.',
    '.orRRRRRRRRRRro.',
    '.orRRRwwwwRRRro.',
    '.orRRRRRRRRRRro.',
    '.oorRRRRRRRRroo.',
    '..oorrrrrrrroo..',
    '...okko..okko...',
    '...ooo....ooo...'
  ];
  var BRUTE_PAL = { o: '#2c3038', r: '#5a6772', R: '#8894a0', e: '#f6e5bb', w: '#3a4550', k: '#3a4550' };

  var WISP = [
    '................',
    '......oooo......',
    '....ooWWWWoo....',
    '...oWWwwwwWWo...',
    '..oWwwwwwwwwWo..',
    '..oWwweEEewwWo..',
    '.oWwwwEEEEwwwWo.',
    '.oWwwwEEEEwwwWo.',
    '..oWwweEEewwWo..',
    '..oWwwwwwwwwWo..',
    '...oWWwwwwWWo...',
    '....ooWWWWoo....',
    '.....o.WW.o.....',
    '......o..o......',
    '.......oo.......',
    '................'
  ];
  var WISP_PAL = { o: '#123a44', W: '#2f97a0', w: '#7ed3cf', E: '#e6fbf7', e: '#bdeeea' };

  var GUARDIAN = [
    '......oooo......',
    '.....oGGGGo.....',
    '....oGvvvvGo....',
    '...oGvvvvvvGo...',
    '...oGvevvveGo...',
    '...oGvvvvvvGo...',
    '....oGvvvvGo....',
    '..ooGGGvvGGGoo..',
    '.oGGvvvvvvvvGGo.',
    '.oGvvvvvvvvvvGo.',
    '.oGvvvGGGGvvvGo.',
    '.oGvvvvvvvvvvGo.',
    '..oGvvvvvvvvGo..',
    '...ovvvvvvvvo...',
    '...ovvo..ovvo...',
    '...ooo....ooo...'
  ];
  var GUARD_PAL = { o: '#241d2e', G: '#f0c463', v: '#544862', e: '#fff2c0' };

  var TIDE = [
    '................',
    '.....oooooo.....',
    '...ooTTTTTToo...',
    '..oTTttttttTTo..',
    '.oTtttttttttttо.',
    '.oTttEEttEEtttо.',
    'oTtttEEttEEttttо',
    'oTttttttttttttto',
    'oTtttHHHHHHtttto',
    'oTttttHHHHtttttо',
    '.oTtttttttttttо.',
    '.oTTtttttttttTо.',
    '..oTTttttttTTo..',
    '...ooTTTTTToo...',
    '.....o.oo.o.....',
    '......oooo......'
  ];
  var TIDE_PAL = { o: '#0a2f43', T: '#17546e', t: '#2f97a0', E: '#e6fbf7', H: '#8fd7d2', 'о': '#0a2f43' };

  function drawMap(g, map, pal, dx, dy, opt) {
    opt = opt || {};
    var legShift = opt.legShift || 0, headShift = opt.headShift || 0;
    var lean = opt.lean || 0, squash = opt.squash || 0, tintAll = opt.tintAll;
    for (var y = 0; y < map.length; y++) {
      var row = map[y];
      for (var x = 0; x < row.length; x++) {
        var ch = row[x];
        if (ch === '.' || ch === undefined) continue;
        var col = tintAll || pal[ch] || pal.o || '#000';
        var oy = 0, ox = 0;
        if (legShift && y >= 13) oy = (x < 8) === (legShift > 0) ? -1 : 0;
        if (headShift && y >= 2 && y <= 8) oy = 1;
        if (lean) ox = Math.round((15 - y) / 15 * lean);
        if (squash) {
          oy += Math.round((y / 15) * -squash);
          ox += Math.round((x - 8) / 8 * squash * 0.6);
        }
        g.fillStyle = col;
        g.fillRect(dx + x + ox, dy + y + oy, 1, 1);
      }
    }
  }

  function buildAtlas(scene) {
    var CW = 512, CH = 512;
    var a = cv(CW, CH);
    var frames = {};
    var cx = 0, cy = 0, rowH = 0;
    function slot(name, w, h, draw) {
      if (cx + w > CW) { cx = 0; cy += rowH + 1; rowH = 0; }
      draw(a.g, cx, cy);
      frames[name] = { frame: { x: cx, y: cy, w: w, h: h } };
      cx += w + 1;
      if (h > rowH) rowH = h;
    }

    /* -- drifter, five states per facing -------------------------------- */
    var facings = [['d', DOWN], ['u', UP], ['s', SIDE]];
    for (var fi = 0; fi < facings.length; fi++) {
      (function (key, map) {
        slot('dr_' + key + '_idle0', 16, 16, function (g, x, y) { drawMap(g, map, DRIFTER_PAL, x, y, {}); });
        slot('dr_' + key + '_idle1', 16, 16, function (g, x, y) { drawMap(g, map, DRIFTER_PAL, x, y, { headShift: 1 }); });
        slot('dr_' + key + '_walk0', 16, 16, function (g, x, y) { drawMap(g, map, DRIFTER_PAL, x, y, { legShift: 1 }); });
        slot('dr_' + key + '_walk1', 16, 16, function (g, x, y) { drawMap(g, map, DRIFTER_PAL, x, y, { legShift: -1 }); });
        slot('dr_' + key + '_wind', 16, 16, function (g, x, y) { drawMap(g, map, DRIFTER_PAL, x, y, { lean: -1 }); });
        slot('dr_' + key + '_atk', 16, 16, function (g, x, y) {
          drawMap(g, map, DRIFTER_PAL, x, y - 1, { lean: 2 });
          g.fillStyle = DRIFTER_PAL.s;
          g.fillRect(x + 12, y + 7, 2, 2);
          g.fillRect(x + 2, y + 7, 2, 2);
        });
      })(facings[fi][0], facings[fi][1]);
    }

    /* -- enemy sheets ---------------------------------------------------- */
    var FOES = [
      ['moss', MOSSLING, MOSS_PAL], ['skit', SKITTER, SKIT_PAL], ['brut', BRUTE, BRUTE_PAL],
      ['wisp', WISP, WISP_PAL], ['guard', GUARDIAN, GUARD_PAL], ['tide', TIDE, TIDE_PAL]
    ];
    for (var ei = 0; ei < FOES.length; ei++) {
      (function (key, map, pal) {
        slot('e_' + key + '_idle0', 16, 16, function (g, x, y) { drawMap(g, map, pal, x, y, {}); });
        slot('e_' + key + '_idle1', 16, 16, function (g, x, y) { drawMap(g, map, pal, x, y, { squash: 1 }); });
        slot('e_' + key + '_walk0', 16, 16, function (g, x, y) { drawMap(g, map, pal, x, y, { legShift: 1, lean: 1 }); });
        slot('e_' + key + '_walk1', 16, 16, function (g, x, y) { drawMap(g, map, pal, x, y, { legShift: -1, lean: -1 }); });
        slot('e_' + key + '_atk', 16, 16, function (g, x, y) { drawMap(g, map, pal, x, y - 1, { lean: 3, squash: -1 }); });
        slot('e_' + key + '_hurt', 16, 16, function (g, x, y) {
          drawMap(g, map, pal, x, y, { lean: -3, tintAll: '#ffd6d6' });
          drawMap(g, map, { o: '#c0384a' }, x, y, { lean: -3 });
        });
        slot('e_' + key + '_die', 16, 16, function (g, x, y) { drawMap(g, map, pal, x, y + 3, { squash: 4 }); });
      })(FOES[ei][0], FOES[ei][1], FOES[ei][2]);
    }

    /* -- landmark props, all in the island ramp -------------------------- */
    slot('p_palm', 16, 24, function (g, x, y) {
      g.fillStyle = '#5b4029'; g.fillRect(x + 7, y + 10, 2, 14);
      g.fillStyle = '#8a5a34'; g.fillRect(x + 7, y + 10, 1, 14);
      var fr = [[-6, 2], [6, 2], [-5, -2], [5, -2], [0, -5]];
      for (var i = 0; i < fr.length; i++) {
        for (var k = 0; k < 7; k++) {
          var px = x + 8 + (fr[i][0] * k / 6) | 0;
          var py = y + 9 + (fr[i][1] * k / 6) + (k * k) * 0.09;
          g.fillStyle = k < 4 ? '#3f8c4a' : '#2a6a3c';
          g.fillRect(px, py | 0, 2, 2);
        }
      }
      g.fillStyle = '#c39a5e'; g.fillRect(x + 6, y + 7, 4, 3);
    });
    slot('p_crate', 16, 14, function (g, x, y) {
      g.fillStyle = '#5b4029'; g.fillRect(x + 2, y + 2, 12, 12);
      g.fillStyle = '#8a5a34'; g.fillRect(x + 3, y + 3, 10, 10);
      g.fillStyle = '#b08a55'; g.fillRect(x + 3, y + 3, 10, 2);
      g.fillStyle = '#5b4029'; g.fillRect(x + 3, y + 7, 10, 1); g.fillRect(x + 7, y + 3, 1, 10);
    });
    slot('p_barrel', 14, 16, function (g, x, y) {
      g.fillStyle = '#5b4029'; g.fillRect(x + 2, y + 2, 10, 14);
      g.fillStyle = '#8a5a34'; g.fillRect(x + 3, y + 3, 8, 12);
      g.fillStyle = '#b08a55'; g.fillRect(x + 3, y + 3, 3, 12);
      g.fillStyle = '#5b4029'; g.fillRect(x + 2, y + 6, 10, 1); g.fillRect(x + 2, y + 11, 10, 1);
    });
    slot('p_shelter', 28, 20, function (g, x, y) {
      g.fillStyle = '#5b4029'; g.fillRect(x + 1, y + 8, 26, 12);
      g.fillStyle = '#8a5a34'; g.fillRect(x + 2, y + 9, 24, 10);
      for (var i = 0; i < 6; i++) { g.fillStyle = '#6f5231'; g.fillRect(x + 2 + i * 4, y + 9, 1, 10); }
      g.fillStyle = '#2a6a3c';
      for (var k = 0; k < 14; k++) { g.fillRect(x + 14 - k, y + 8 - (k >> 1), 2, 2); g.fillRect(x + 14 + k, y + 8 - (k >> 1), 2, 2); }
      g.fillStyle = '#3f8c4a'; g.fillRect(x + 12, y + 1, 4, 2);
    });
    slot('p_gate', 32, 34, function (g, x, y) {
      g.fillStyle = '#382f47'; g.fillRect(x + 1, y + 6, 8, 28); g.fillRect(x + 23, y + 6, 8, 28);
      g.fillStyle = '#7a6b85'; g.fillRect(x + 2, y + 7, 6, 26); g.fillRect(x + 24, y + 7, 6, 26);
      g.fillStyle = '#a99bb0'; g.fillRect(x + 2, y + 7, 2, 26); g.fillRect(x + 24, y + 7, 2, 26);
      g.fillStyle = '#382f47'; g.fillRect(x + 1, y + 1, 30, 7);
      g.fillStyle = '#7a6b85'; g.fillRect(x + 2, y + 2, 28, 5);
      g.fillStyle = '#c8b6d8'; g.fillRect(x + 14, y + 2, 4, 5);
      g.fillStyle = '#150f1c'; g.fillRect(x + 9, y + 8, 14, 26);
    });
    slot('p_ruindoor', 40, 44, function (g, x, y) {
      g.fillStyle = '#2b243a'; g.fillRect(x, y + 4, 40, 40);
      g.fillStyle = '#544862'; g.fillRect(x + 2, y + 6, 36, 38);
      g.fillStyle = '#7a6b85'; g.fillRect(x + 4, y + 8, 32, 34);
      g.fillStyle = '#2b243a'; g.fillRect(x + 10, y + 14, 20, 30);
      g.fillStyle = '#a99bb0';
      g.fillRect(x + 17, y + 18, 6, 2); g.fillRect(x + 19, y + 18, 2, 20); g.fillRect(x + 14, y + 36, 12, 2);
      g.fillStyle = '#c8b6d8'; g.fillRect(x + 6, y + 0, 28, 4);
    });
    slot('p_chest0', 20, 16, function (g, x, y) {
      g.fillStyle = '#3c2519'; g.fillRect(x + 1, y + 5, 18, 11);
      g.fillStyle = '#a4693a'; g.fillRect(x + 2, y + 6, 16, 9);
      g.fillStyle = '#d9a266'; g.fillRect(x + 2, y + 6, 16, 3);
      g.fillStyle = '#f0c463'; g.fillRect(x + 8, y + 8, 4, 5);
      g.fillStyle = '#3c2519'; g.fillRect(x + 9, y + 10, 2, 2);
    });
    slot('p_chest1', 20, 16, function (g, x, y) {
      g.fillStyle = '#3c2519'; g.fillRect(x + 1, y + 8, 18, 8);
      g.fillStyle = '#a4693a'; g.fillRect(x + 2, y + 9, 16, 6);
      g.fillStyle = '#3c2519'; g.fillRect(x + 1, y + 1, 18, 5);
      g.fillStyle = '#d9a266'; g.fillRect(x + 2, y + 2, 16, 3);
      g.fillStyle = '#fff2c0'; g.fillRect(x + 6, y + 7, 8, 2);
    });
    for (var fk = 0; fk < 3; fk++) {
      (function (k) {
        slot('p_fire' + k, 12, 16, function (g, x, y) {
          var h = 9 + k * 2;
          for (var yy = 0; yy < h; yy++) {
            var w = Math.max(1, ((h - yy) * 0.7) | 0) + (yy % 2 === k % 2 ? 1 : 0);
            var col = yy < h * 0.3 ? '#fff2c0' : yy < h * 0.6 ? '#f0c463' : '#e07a3c';
            g.fillStyle = col;
            g.fillRect(x + 6 - (w >> 1), y + 15 - yy, w, 1);
          }
          g.fillStyle = '#5b4029'; g.fillRect(x + 1, y + 14, 10, 2);
        });
      })(fk);
    }
    slot('p_grass', 12, 10, function (g, x, y) {
      g.fillStyle = '#2a6a3c';
      g.fillRect(x + 2, y + 4, 1, 6); g.fillRect(x + 5, y + 2, 1, 8); g.fillRect(x + 8, y + 5, 1, 5);
      g.fillStyle = '#5cae52'; g.fillRect(x + 5, y + 2, 1, 2); g.fillRect(x + 2, y + 4, 1, 2);
    });

    /* -- particles ------------------------------------------------------- */
    slot('fx_spark', 4, 4, function (g, x, y) {
      g.fillStyle = '#ffffff'; g.fillRect(x + 1, y, 2, 4); g.fillRect(x, y + 1, 4, 2);
    });
    slot('fx_puff', 6, 6, function (g, x, y) {
      g.fillStyle = 'rgba(255,255,255,0.85)';
      g.beginPath(); g.arc(x + 3, y + 3, 2.6, 0, 6.283); g.fill();
    });
    slot('fx_leaf', 6, 6, function (g, x, y) {
      g.fillStyle = '#ffffff';
      g.beginPath(); g.ellipse(x + 3, y + 3, 2.8, 1.5, 0.6, 0, 6.283); g.fill();
    });
    slot('fx_shard', 5, 7, function (g, x, y) {
      g.fillStyle = '#ffffff';
      g.fillRect(x + 2, y, 1, 7); g.fillRect(x + 1, y + 2, 3, 3);
    });

    /* -- UI parts, all pixel snapped to the 16px world grid --------------- */
    var HEART = ['..oo..oo..', '.oXXooXXo.', 'oXXXXXXXXo', 'oXXXXXXXXo', 'oXXXXXXXXo', '.oXXXXXXo.', '..oXXXXo..', '...oXXo...', '....oo....'];
    function heartFrame(name, colA, colB) {
      slot(name, 10, 9, function (g, x, y) {
        for (var yy = 0; yy < HEART.length; yy++) for (var xx = 0; xx < HEART[yy].length; xx++) {
          var ch = HEART[yy][xx];
          if (ch === '.') continue;
          g.fillStyle = ch === 'o' ? '#26161c' : (yy < 3 ? colB : colA);
          g.fillRect(x + xx, y + yy, 1, 1);
        }
      });
    }
    heartFrame('ui_heart_full', '#e8556b', '#ff8a97');
    heartFrame('ui_heart_empty', '#4a3341', '#5d4152');

    slot('ui_relic_on', 11, 11, function (g, x, y) {
      for (var yy = 0; yy < 11; yy++) for (var xx = 0; xx < 11; xx++) {
        var d = Math.abs(xx - 5) + Math.abs(yy - 5);
        if (d <= 5) { g.fillStyle = d === 5 ? '#241d2e' : d > 2 ? '#f0c463' : '#fff2c0'; g.fillRect(x + xx, y + yy, 1, 1); }
      }
    });
    slot('ui_relic_off', 11, 11, function (g, x, y) {
      for (var yy = 0; yy < 11; yy++) for (var xx = 0; xx < 11; xx++) {
        var d = Math.abs(xx - 5) + Math.abs(yy - 5);
        if (d === 5 || d === 4) { g.fillStyle = '#5c5a4b'; g.fillRect(x + xx, y + yy, 1, 1); }
      }
    });
    slot('ui_sigil', 10, 12, function (g, x, y) {
      for (var yy = 0; yy < 12; yy++) {
        var w = yy < 6 ? 1 + yy : 12 - yy;
        for (var xx = 5 - w; xx <= 4 + w; xx++) {
          if (xx < 0 || xx > 9) continue;
          g.fillStyle = xx < 5 ? '#8ee6d8' : '#4fb9ad';
          g.fillRect(x + xx, y + yy, 1, 1);
        }
      }
    });
    slot('ui_sword', 10, 10, function (g, x, y) {
      g.fillStyle = '#20242e'; g.fillRect(x + 4, y, 3, 8);
      g.fillStyle = '#cfd8e0'; g.fillRect(x + 5, y + 1, 1, 6);
      g.fillStyle = '#c78b3f'; g.fillRect(x + 2, y + 7, 7, 2);
    });
    slot('ui_shield', 10, 10, function (g, x, y) {
      g.fillStyle = '#20242e'; g.fillRect(x + 1, y, 8, 6);
      g.fillStyle = '#8894a0'; g.fillRect(x + 2, y + 1, 6, 5);
      g.fillStyle = '#b5c1c8'; g.fillRect(x + 2, y + 1, 2, 5);
      g.fillStyle = '#20242e'; g.fillRect(x + 3, y + 6, 4, 2); g.fillRect(x + 4, y + 8, 2, 1);
    });
    slot('ui_boot', 10, 10, function (g, x, y) {
      g.fillStyle = '#20242e'; g.fillRect(x + 2, y + 1, 4, 6); g.fillRect(x + 2, y + 6, 7, 3);
      g.fillStyle = '#8a5a34'; g.fillRect(x + 3, y + 2, 2, 5); g.fillRect(x + 3, y + 7, 5, 1);
    });
    slot('ui_pause', 12, 12, function (g, x, y) {
      g.fillStyle = '#dff2ea'; g.fillRect(x + 3, y + 2, 2, 8); g.fillRect(x + 7, y + 2, 2, 8);
    });
    slot('ui_marker', 12, 14, function (g, x, y) {
      g.fillStyle = '#20242e'; g.fillRect(x + 3, y, 6, 8); g.fillRect(x + 4, y + 8, 4, 2); g.fillRect(x + 5, y + 10, 2, 2);
      g.fillStyle = '#f0c463'; g.fillRect(x + 4, y + 1, 4, 6); g.fillRect(x + 5, y + 7, 2, 3);
      g.fillStyle = '#fff2c0'; g.fillRect(x + 4, y + 1, 2, 6);
    });
    // shape coded minimap markers
    slot('mm_camp', 7, 7, function (g, x, y) {
      g.fillStyle = '#20242e'; g.fillRect(x, y, 7, 7);
      g.fillStyle = '#f0e9a8'; g.fillRect(x + 1, y + 1, 5, 5);
      g.fillStyle = '#e07a3c'; g.fillRect(x + 2, y + 2, 3, 3);
    });
    slot('mm_gate', 7, 7, function (g, x, y) {
      g.fillStyle = '#20242e';
      for (var yy = 0; yy < 7; yy++) for (var xx = 0; xx < 7; xx++) if (Math.abs(xx - 3) + Math.abs(yy - 3) <= 3) g.fillRect(x + xx, y + yy, 1, 1);
      g.fillStyle = '#ffe28b';
      for (var y2 = 0; y2 < 7; y2++) for (var x2 = 0; x2 < 7; x2++) if (Math.abs(x2 - 3) + Math.abs(y2 - 3) <= 2) g.fillRect(x + x2, y + y2, 1, 1);
    });
    slot('mm_ruin', 9, 9, function (g, x, y) {
      g.fillStyle = '#20242e'; g.fillRect(x + 1, y + 1, 7, 7);
      g.fillStyle = '#c8b6d8'; g.fillRect(x + 2, y + 2, 5, 5);
      g.fillStyle = '#20242e'; g.fillRect(x + 4, y + 3, 1, 3);
    });
    slot('mm_sigil', 5, 5, function (g, x, y) {
      g.fillStyle = '#20242e'; g.fillRect(x + 2, y, 1, 5); g.fillRect(x, y + 2, 5, 1);
      g.fillStyle = '#8ee6d8'; g.fillRect(x + 2, y + 1, 1, 3); g.fillRect(x + 1, y + 2, 3, 1);
    });
    slot('mm_player', 9, 9, function (g, x, y) {
      g.fillStyle = '#0a1c22'; g.fillRect(x, y, 9, 9);
      g.fillStyle = '#ffffff'; g.fillRect(x + 1, y + 1, 7, 7);
      g.fillStyle = '#2f7d6d'; g.fillRect(x + 3, y + 3, 3, 3);
    });

    // pixel nine-slice panel: 8px corners on a 24x24 source
    slot('ui_panel', 24, 24, function (g, x, y) {
      g.fillStyle = '#11262e'; g.fillRect(x, y, 24, 24);
      g.fillStyle = '#1b3a45'; g.fillRect(x + 3, y + 3, 18, 18);
      g.fillStyle = '#86b6aa'; g.fillRect(x, y, 24, 2); g.fillRect(x, y + 22, 24, 2);
      g.fillRect(x, y, 2, 24); g.fillRect(x + 22, y, 2, 24);
      g.fillStyle = '#c7e6d6'; g.fillRect(x, y, 4, 2); g.fillRect(x, y, 2, 4);
      g.fillRect(x + 20, y, 4, 2); g.fillRect(x + 22, y, 2, 4);
      g.fillStyle = '#0a1a22'; g.fillRect(x + 2, y + 20, 20, 2);
    });
    slot('ui_bar', 24, 24, function (g, x, y) {
      g.fillStyle = 'rgba(6,18,24,0.82)'; g.fillRect(x, y, 24, 24);
      g.fillStyle = '#5f7f84'; g.fillRect(x, y, 24, 1); g.fillRect(x, y + 23, 24, 1);
      g.fillRect(x, y, 1, 24); g.fillRect(x + 23, y, 1, 24);
      g.fillStyle = '#8fc3b4'; g.fillRect(x, y, 3, 1); g.fillRect(x + 21, y, 3, 1);
    });
    slot('ui_btn', 24, 24, function (g, x, y) {
      g.fillStyle = '#1c3a44'; g.fillRect(x, y, 24, 24);
      g.fillStyle = '#26505c'; g.fillRect(x + 2, y + 2, 20, 18);
      g.fillStyle = '#76a89c'; g.fillRect(x, y, 24, 2); g.fillRect(x, y, 2, 24); g.fillRect(x + 22, y, 2, 24);
      g.fillStyle = '#0a1a22'; g.fillRect(x, y + 20, 24, 4);
    });
    slot('ui_btn_hi', 24, 24, function (g, x, y) {
      g.fillStyle = '#7fbf5e'; g.fillRect(x, y, 24, 24);
      g.fillStyle = '#cae6a0'; g.fillRect(x + 2, y + 2, 20, 18);
      g.fillStyle = '#e6ffc8'; g.fillRect(x, y, 24, 2); g.fillRect(x, y, 2, 24);
      g.fillStyle = '#3c6b2c'; g.fillRect(x, y + 20, 24, 4); g.fillRect(x + 22, y, 2, 24);
    });

    // touch controls: pixel stepped rings, not antialiased gradient discs
    function ring(g, x, y, size, cols, step) {
      var r = size / 2;
      for (var yy = 0; yy < size; yy++) for (var xx = 0; xx < size; xx++) {
        var dx = (xx - r + 0.5), dy = (yy - r + 0.5);
        var d = Math.sqrt(dx * dx + dy * dy) / r;
        if (d > 1) continue;
        var band = Math.min(cols.length - 1, Math.floor(d * step * cols.length) % cols.length);
        var col = d > 0.93 ? cols[cols.length - 1] : cols[band];
        g.fillStyle = col;
        g.fillRect(x + xx, y + yy, 1, 1);
      }
    }
    slot('ui_stick_base', 56, 56, function (g, x, y) {
      ring(g, x, y, 56, ['rgba(23,64,72,0.62)', 'rgba(18,50,60,0.62)', 'rgba(12,34,42,0.62)', 'rgba(199,234,219,0.55)'], 1);
      g.fillStyle = 'rgba(199,234,219,0.30)';
      g.fillRect(x + 26, y + 6, 4, 4); g.fillRect(x + 26, y + 46, 4, 4);
      g.fillRect(x + 6, y + 26, 4, 4); g.fillRect(x + 46, y + 26, 4, 4);
    });
    slot('ui_stick_knob', 26, 26, function (g, x, y) {
      ring(g, x, y, 26, ['#c7f2df', '#8fd8c0', '#5aa892', '#e0fff1'], 1);
    });
    slot('ui_action', 66, 66, function (g, x, y) {
      ring(g, x, y, 66, ['#e09a68', '#c97a4e', '#8c3a2c', '#f4d6a1'], 1);
    });
    slot('ui_action_press', 66, 66, function (g, x, y) {
      ring(g, x, y, 66, ['#8c3a2c', '#a55a3c', '#6b2a20', '#f4d6a1'], 1);
    });
    slot('ui_action_off', 66, 66, function (g, x, y) {
      ring(g, x, y, 66, ['#4a4038', '#3a322c', '#2a241f', '#7a6f63'], 1);
    });
    slot('ui_small', 34, 34, function (g, x, y) {
      ring(g, x, y, 34, ['#2d4c58', '#1c3844', '#122630', '#a0cec4'], 1);
    });

    // slash arc, pixel stepped
    slot('fx_slash', 40, 40, function (g, x, y) {
      for (var yy = 0; yy < 40; yy++) for (var xx = 0; xx < 40; xx++) {
        var dx = xx - 20, dy = yy - 20;
        var d = Math.sqrt(dx * dx + dy * dy);
        var an = Math.atan2(dy, dx);
        if (d > 19 || d < 13 || Math.abs(an) > 1.15) continue;
        var t = (19 - d) / 6;
        g.fillStyle = t > 0.66 ? 'rgba(255,255,235,0.95)' : t > 0.33 ? 'rgba(255,240,190,0.75)' : 'rgba(255,214,150,0.4)';
        g.fillRect(x + xx, y + yy, 1, 1);
      }
    });

    scene.textures.addAtlas('dl', a.c, { frames: frames });

    /* -- glow and torch stay separate: additive blend, linear filtered ---- */
    var v = cv(64, 64);
    var gr = v.g.createRadialGradient(32, 32, 6, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,244,205,0.55)');
    gr.addColorStop(1, 'rgba(255,244,205,0)');
    v.g.fillStyle = gr; v.g.fillRect(0, 0, 64, 64);
    var glowTex = scene.textures.addCanvas('glow', v.c);
    if (glowTex && glowTex.setFilter) glowTex.setFilter(1);

    var t2 = cv(256, 256);
    var tg = t2.g.createRadialGradient(128, 128, 26, 128, 128, 128);
    tg.addColorStop(0, 'rgba(0,0,0,0)');
    tg.addColorStop(0.42, 'rgba(0,0,0,0.18)');
    tg.addColorStop(0.72, 'rgba(0,0,0,0.58)');
    tg.addColorStop(1, 'rgba(0,0,0,0.93)');
    t2.g.fillStyle = tg; t2.g.fillRect(0, 0, 256, 256);
    var torchTex = scene.textures.addCanvas('torch', t2.c);
    if (torchTex && torchTex.setFilter) torchTex.setFilter(1);

    var px = cv(2, 2); px.g.fillStyle = '#ffffff'; px.g.fillRect(0, 0, 2, 2);
    scene.textures.addCanvas('px', px.c);
  }

  /* ========================================================= PIXEL FONT === */
  /* One fixed cell bitmap font, baked to 1 bit so it reads as pixel type and
   * costs no text measuring or texture upload during play.
   */
  var CHARSET = (function () {
    var s = '';
    for (var i = 32; i < 128; i++) s += String.fromCharCode(i);
    return s;
  })();

  function buildFont(scene) {
    var CW = 8, CH = 10, PER = 16, ROWS = 6;
    var f = cv(CW * PER, CH * ROWS);
    var g = f.g;
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    // Regular weight at 10px: bold 9px closed the counters, so 0, 8, B and D
    // all thresholded into solid blocks and the HUD read "SCORE :" as boxes.
    g.font = '10px ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace';
    g.fillStyle = '#ffffff';
    for (var i = 0; i < CHARSET.length; i++) {
      var ch = CHARSET[i];
      if (ch === ' ') continue;
      var cxp = (i % PER) * CW + CW / 2;
      var cyp = Math.floor(i / PER) * CH + 8;
      g.fillText(ch, cxp, cyp);
    }
    // snap to 1 bit so nothing is antialiased at integer upscale
    var d = g.getImageData(0, 0, f.c.width, f.c.height), p = d.data;
    for (var k = 0; k < p.length; k += 4) {
      var on = p[k + 3] > 128;
      p[k] = p[k + 1] = p[k + 2] = 255;
      p[k + 3] = on ? 255 : 0;
    }
    g.putImageData(d, 0, 0);
    scene.textures.addCanvas('pixfont', f.c);
    var data = Phaser.GameObjects.RetroFont.Parse(scene, {
      image: 'pixfont', width: CW, height: CH, chars: CHARSET,
      charsPerRow: PER, offset: { x: 0, y: 0 }, spacing: { x: 0, y: 0 }, lineSpacing: 2
    });
    scene.cache.bitmapFont.add('pix', data);
  }

  DL.FONT_H = 10;
  // Split so the loading scene can yield a frame between each bake and keep
  // its own progress bar honest instead of blocking on one long task.
  DL.buildFont = buildFont;
  DL.buildAtlas = buildAtlas;
  DL.buildTerrain = buildTerrain;
  DL.buildArt = function (scene) {
    buildFont(scene);
    buildAtlas(scene);
    return buildTerrain(scene);
  };
  DL.noise = noise;
  DL.PAL = PAL;
  DL.DUN = DUN;
})(window);
