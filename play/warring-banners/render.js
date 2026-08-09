// Warring Banners - canvas renderer, camera, particles. Greybox but readable.
var R = (function () {
  var cv, ctx, W = 1, H = 1, dpr = 1;
  var cam = { x: 0, y: 0, z: 1, minZ: 0.55, maxZ: 2.4 };
  var HS = 34;                       // world hex size
  var parts = [], PART_CAP = 180;
  var floats = [], FLOAT_CAP = 20;
  var shake = 0, flash = 0, flashCol = '#fff';
  var anims = [], ANIM_CAP = 12;
  var t0 = 0;

  function init(canvas) {
    cv = canvas; ctx = cv.getContext('2d', { alpha: false });
    resize();
  }
  function resize() {
    if (!cv) return;
    var rect = cv.getBoundingClientRect();
    var cssW = Math.max(1, rect.width), cssH = Math.max(1, rect.height);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    var longCss = Math.max(cssW, cssH);
    var scale = Math.min(dpr, 960 / Math.max(1, longCss));
    if (scale < 0.5) scale = 0.5;
    W = Math.round(cssW * scale); H = Math.round(cssH * scale);
    cv.width = W; cv.height = H;
    cv.__scale = scale; cv.__cssW = cssW; cv.__cssH = cssH;
  }
  function sc() { return (cv && cv.__scale) || 1; }

  function fit() {
    var S = G.state;
    if (!S) return;
    var minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    for (var i = 0; i < S.list.length; i++) {
      var p = HEX.toPix(S.list[i].q, S.list[i].r, HS);
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    }
    cam.x = (minX + maxX) / 2; cam.y = (minY + maxY) / 2;
    var mw = (maxX - minX) + HS * 2.4, mh = (maxY - minY) + HS * 2.6;
    var z = Math.min(W / mw, H / mh);
    cam.minZ = z * 0.8; cam.maxZ = z * 3.0;
    cam.z = z;
    clampCam();
  }
  function clampCam() {
    var S = G.state;
    if (!S) return;
    if (cam.z < cam.minZ) cam.z = cam.minZ;
    if (cam.z > cam.maxZ) cam.z = cam.maxZ;
    var lim = HS * 6.4;
    if (cam.x < -lim) cam.x = -lim; if (cam.x > lim) cam.x = lim;
    if (cam.y < -lim) cam.y = -lim; if (cam.y > lim) cam.y = lim;
  }
  function w2s(x, y) { return { x: (x - cam.x) * cam.z + W / 2, y: (y - cam.y) * cam.z + H / 2 }; }
  function s2w(x, y) { return { x: (x - W / 2) / cam.z + cam.x, y: (y - H / 2) / cam.z + cam.y }; }
  // css px -> hex
  function pick(cssX, cssY) {
    var s = sc(), w = s2w(cssX * s, cssY * s);
    return HEX.fromPix(w.x, w.y, HS);
  }
  function panBy(dxCss, dyCss) {
    var s = sc();
    cam.x -= dxCss * s / cam.z; cam.y -= dyCss * s / cam.z; clampCam();
  }
  function zoomAt(mul, cssX, cssY) {
    var s = sc(), bx = cssX * s, by = cssY * s;
    var before = s2w(bx, by);
    cam.z *= mul; clampCam();
    var after = s2w(bx, by);
    cam.x += before.x - after.x; cam.y += before.y - after.y; clampCam();
  }

  // ---- fx (all capped: hardening #5) ----
  function burst(q, r, col, n, pow) {
    var p = HEX.toPix(q, r, HS);
    n = Math.min(n || 10, 26);
    for (var i = 0; i < n; i++) {
      if (parts.length >= PART_CAP) parts.shift();
      var a = Math.random() * Math.PI * 2, sp = (0.35 + Math.random()) * (pow || 60);
      parts.push({ x: p.x, y: p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 20,
                   life: 0.45 + Math.random() * 0.4, max: 0.85, col: col, r: 2 + Math.random() * 2.5 });
    }
  }
  function say(q, r, txt, col) {
    var p = HEX.toPix(q, r, HS);
    if (floats.length >= FLOAT_CAP) floats.shift();
    floats.push({ x: p.x, y: p.y - HS * 0.5, txt: txt, col: col || '#fff', life: 1.0, max: 1.0 });
  }
  function kick(m, col) { shake = Math.min(18, shake + m); if (col) { flash = 0.28; flashCol = col; } }
  function march(a, q, r) {
    var from = HEX.toPix(a.q, a.r, HS);
    if (anims.length >= ANIM_CAP) anims.shift();
    anims.push({ id: a.id, x: from.x, y: from.y, t: 0, dur: 0.22 });
    burst(a.q, a.r, '#c9cfd8', 6, 34);
  }
  function clearFx() { parts.length = 0; floats.length = 0; anims.length = 0; shake = 0; flash = 0; }

  function step(dt) {
    var i;
    for (i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      p.life -= dt;
      if (p.life <= 0) { parts.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 150 * dt; p.vx *= 0.96;
    }
    for (i = floats.length - 1; i >= 0; i--) {
      var f = floats[i]; f.life -= dt * 0.9; f.y -= 22 * dt;
      if (f.life <= 0) floats.splice(i, 1);
    }
    for (i = anims.length - 1; i >= 0; i--) {
      anims[i].t += dt;
      if (anims[i].t >= anims[i].dur) anims.splice(i, 1);
    }
    if (shake > 0) { shake -= dt * 46; if (shake < 0) shake = 0; }
    if (flash > 0) { flash -= dt * 1.6; if (flash < 0) flash = 0; }
    t0 += dt;
  }

  // ---- drawing ----
  function hexPath(cx, cy, s) {
    ctx.beginPath();
    for (var i = 0; i < 6; i++) {
      var a = Math.PI / 180 * (60 * i - 30);
      var x = cx + s * Math.cos(a), y = cy + s * Math.sin(a);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  function draw(view) {
    if (!ctx) return;
    var S = G.state;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#14171d';
    ctx.fillRect(0, 0, W, H);
    if (!S) return;

    var sh = shake > 0 ? shake : 0;
    var ox = sh ? (Math.random() * 2 - 1) * sh : 0;
    var oy = sh ? (Math.random() * 2 - 1) * sh : 0;
    ctx.save();
    ctx.translate(ox, oy);

    var z = cam.z, s = HS * z;
    var sel = S.sel != null ? G.armyById(S.sel) : null;
    var reach = S.reach ? S.reach.reach : null;
    var targets = S.reach ? S.reach.targets : null;
    var pulse = 0.5 + 0.5 * Math.sin(t0 * 4.2);

    // hexes
    for (var i = 0; i < S.list.length; i++) {
      var h = S.list[i];
      var wp = HEX.toPix(h.q, h.r, HS), sp = w2s(wp.x, wp.y);
      if (sp.x < -s * 2 || sp.x > W + s * 2 || sp.y < -s * 2 || sp.y > H + s * 2) continue;
      var T = G.TERR[h.terr];
      hexPath(sp.x, sp.y, s * 0.96);
      ctx.fillStyle = ((h.q + h.r) & 1) ? T.col : T.col2;
      ctx.fill();

      if (h.owner >= 0) {
        ctx.save(); ctx.clip();
        ctx.globalAlpha = 0.30;
        ctx.fillStyle = G.FACTIONS[h.owner].col;
        ctx.fillRect(sp.x - s, sp.y - s, s * 2, s * 2);
        ctx.globalAlpha = 1;
        ctx.restore();
      }
      // terrain hatch marks
      ctx.strokeStyle = 'rgba(0,0,0,.30)';
      ctx.lineWidth = Math.max(1, 1.2 * z);
      hexPath(sp.x, sp.y, s * 0.96); ctx.stroke();
      if (h.owner >= 0) {
        ctx.strokeStyle = G.FACTIONS[h.owner].col;
        ctx.lineWidth = Math.max(1.4, 2.2 * z);
        hexPath(sp.x, sp.y, s * 0.86); ctx.stroke();
      }
      drawTerrainMark(sp.x, sp.y, s, h.terr);
      if (h.keep >= 0) drawKeep(sp.x, sp.y, s, h.keep, S.alive[h.keep]);

      // move / attack overlays
      var k = HEX.key(h.q, h.r);
      if (reach && reach[k] !== undefined) {
        ctx.fillStyle = 'rgba(232,238,248,' + (0.13 + pulse * 0.10) + ')';
        hexPath(sp.x, sp.y, s * 0.90); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.75)';
        ctx.beginPath(); ctx.arc(sp.x, sp.y + s * 0.42, Math.max(2, 3 * z), 0, 6.29); ctx.fill();
      }
      if (targets && targets[k]) {
        ctx.strokeStyle = 'rgba(240,90,80,' + (0.6 + pulse * 0.4) + ')';
        ctx.lineWidth = Math.max(2, 3.2 * z);
        hexPath(sp.x, sp.y, s * 0.82); ctx.stroke();
      }
      if (view.cursor && view.showCursor && h.q === view.cursor.q && h.r === view.cursor.r) {
        ctx.strokeStyle = '#f0e08a'; ctx.lineWidth = Math.max(2, 2.6 * z);
        ctx.setLineDash([Math.max(3, 5 * z), Math.max(3, 4 * z)]);
        hexPath(sp.x, sp.y, s * 0.74); ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // armies
    for (i = 0; i < S.armies.length; i++) {
      var a = S.armies[i];
      var wp2 = HEX.toPix(a.q, a.r, HS);
      var an = null;
      for (var j = 0; j < anims.length; j++) if (anims[j].id === a.id) an = anims[j];
      if (an) {
        var u = Math.min(1, an.t / an.dur); u = u * u * (3 - 2 * u);
        wp2 = { x: an.x + (wp2.x - an.x) * u, y: an.y + (wp2.y - an.y) * u };
      }
      var ap = w2s(wp2.x, wp2.y);
      drawArmy(ap.x, ap.y, s, a, sel && sel.id === a.id, pulse);
    }

    // particles
    for (i = 0; i < parts.length; i++) {
      var pt = parts[i], pp = w2s(pt.x, pt.y);
      ctx.globalAlpha = Math.max(0, pt.life / pt.max);
      ctx.fillStyle = pt.col;
      ctx.fillRect(pp.x - pt.r * z, pp.y - pt.r * z, pt.r * 2 * z, pt.r * 2 * z);
    }
    ctx.globalAlpha = 1;

    // floating text
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (i = 0; i < floats.length; i++) {
      var fl = floats[i], fp = w2s(fl.x, fl.y);
      ctx.globalAlpha = Math.max(0, Math.min(1, fl.life / fl.max));
      ctx.font = 'bold ' + Math.round(15 * Math.max(0.7, z)) + 'px ui-sans-serif,system-ui,sans-serif';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.75)';
      ctx.strokeText(fl.txt, fp.x, fp.y);
      ctx.fillStyle = fl.col; ctx.fillText(fl.txt, fp.x, fp.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    if (flash > 0) {
      ctx.globalAlpha = Math.min(0.45, flash);
      ctx.fillStyle = flashCol; ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }

    // turn banner for AI phase
    if (view.banner) {
      var bh = Math.round(30 * sc());
      ctx.fillStyle = 'rgba(12,14,19,.78)';
      ctx.fillRect(0, H / 2 - bh, W, bh * 2);
      ctx.fillStyle = view.bannerCol || '#fff';
      ctx.font = 'bold ' + Math.round(19 * sc()) + 'px ui-sans-serif,system-ui,sans-serif';
      ctx.fillText(view.banner, W / 2, H / 2);
    }
  }

  function drawTerrainMark(x, y, s, terr) {
    ctx.save();
    if (terr === 'forest') {
      ctx.fillStyle = 'rgba(20,42,24,.85)';
      for (var i = -1; i <= 1; i++) {
        var tx = x + i * s * 0.34, ty = y + (i === 0 ? -s * 0.06 : s * 0.10);
        ctx.beginPath(); ctx.moveTo(tx, ty - s * 0.30);
        ctx.lineTo(tx + s * 0.16, ty + s * 0.12); ctx.lineTo(tx - s * 0.16, ty + s * 0.12);
        ctx.closePath(); ctx.fill();
      }
    } else if (terr === 'hill') {
      ctx.strokeStyle = 'rgba(30,26,16,.75)'; ctx.lineWidth = Math.max(1.5, s * 0.07);
      ctx.beginPath();
      ctx.moveTo(x - s * 0.42, y + s * 0.16); ctx.lineTo(x - s * 0.12, y - s * 0.20);
      ctx.lineTo(x + s * 0.12, y + s * 0.10); ctx.lineTo(x + s * 0.42, y - s * 0.22);
      ctx.stroke();
    } else if (terr === 'water') {
      ctx.strokeStyle = 'rgba(150,195,225,.42)'; ctx.lineWidth = Math.max(1.2, s * 0.055);
      for (var w = -1; w <= 1; w++) {
        ctx.beginPath();
        ctx.moveTo(x - s * 0.44, y + w * s * 0.26);
        ctx.quadraticCurveTo(x, y + w * s * 0.26 - s * 0.16, x + s * 0.44, y + w * s * 0.26);
        ctx.stroke();
      }
    } else if (terr === 'ford') {
      ctx.strokeStyle = 'rgba(226,214,180,.72)'; ctx.lineWidth = Math.max(1.4, s * 0.08);
      ctx.setLineDash([s * 0.16, s * 0.12]);
      ctx.beginPath(); ctx.moveTo(x - s * 0.46, y); ctx.lineTo(x + s * 0.46, y); ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  function drawKeep(x, y, s, f, alive) {
    ctx.save();
    var col = alive ? G.FACTIONS[f].col : '#6a6f79';
    ctx.fillStyle = 'rgba(18,20,26,.80)';
    ctx.fillRect(x - s * 0.34, y - s * 0.40, s * 0.68, s * 0.62);
    ctx.fillStyle = col;
    ctx.fillRect(x - s * 0.34, y - s * 0.52, s * 0.14, s * 0.20);
    ctx.fillRect(x - s * 0.07, y - s * 0.56, s * 0.14, s * 0.24);
    ctx.fillRect(x + s * 0.20, y - s * 0.52, s * 0.14, s * 0.20);
    ctx.strokeStyle = col; ctx.lineWidth = Math.max(1.4, s * 0.06);
    ctx.strokeRect(x - s * 0.34, y - s * 0.40, s * 0.68, s * 0.62);
    ctx.restore();
  }

  function drawArmy(x, y, s, a, isSel, pulse) {
    var F = G.FACTIONS[a.owner];
    var rad = s * 0.42;
    ctx.save();
    if (isSel) {
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.55 + pulse * 0.45) + ')';
      ctx.lineWidth = Math.max(2, s * 0.09);
      ctx.beginPath(); ctx.arc(x, y, rad + s * 0.15, 0, 6.29); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(10,12,16,.55)';
    ctx.beginPath(); ctx.ellipse(x, y + rad * 0.85, rad * 0.9, rad * 0.34, 0, 0, 6.29); ctx.fill();

    ctx.fillStyle = a.sup ? F.col : F.dim;
    ctx.beginPath(); ctx.arc(x, y - s * 0.04, rad, 0, 6.29); ctx.fill();
    ctx.strokeStyle = 'rgba(8,10,14,.9)'; ctx.lineWidth = Math.max(1.2, s * 0.05);
    ctx.stroke();

    if (!a.sup) {
      ctx.strokeStyle = 'rgba(235,90,80,' + (0.6 + pulse * 0.4) + ')';
      ctx.lineWidth = Math.max(1.6, s * 0.07);
      ctx.setLineDash([s * 0.14, s * 0.11]);
      ctx.beginPath(); ctx.arc(x, y - s * 0.04, rad + s * 0.10, 0, 6.29); ctx.stroke();
      ctx.setLineDash([]);
    }
    // unit glyph
    ctx.fillStyle = '#10141a';
    ctx.font = 'bold ' + Math.round(s * 0.44) + 'px ui-sans-serif,system-ui,sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(G.UNITS[a.type].glyph, x, y - s * 0.05);

    // strength pip
    var bw = s * 0.62, bh = s * 0.26, by = y + rad * 0.72;
    ctx.fillStyle = 'rgba(10,12,16,.88)';
    ctx.fillRect(x - bw / 2, by - bh / 2, bw, bh);
    ctx.fillStyle = a.sup ? '#e8eef8' : '#f0a5a0';
    ctx.font = 'bold ' + Math.round(s * 0.21) + 'px ui-sans-serif,system-ui,sans-serif';
    ctx.fillText(String(a.str), x, by);
    if (a.mp > 0 && a.owner === 0) {
      ctx.fillStyle = '#8fd6a0';
      ctx.beginPath(); ctx.arc(x + rad * 0.86, y - rad * 0.72, Math.max(2, s * 0.08), 0, 6.29); ctx.fill();
    }
    ctx.restore();
  }

  return {
    init: init, resize: resize, fit: fit, draw: draw, step: step,
    pick: pick, panBy: panBy, zoomAt: zoomAt, clampCam: clampCam,
    burst: burst, say: say, kick: kick, march: march, clearFx: clearFx,
    get cam() { return cam; }, get HS() { return HS; },
    get w() { return W; }, get h() { return H; }
  };
})();
