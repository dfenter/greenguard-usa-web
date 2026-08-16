/* pn_art.js — Pennant Nine procedural art bakery.
 * Every static pixel is baked into a canvas texture once at boot. Nothing in
 * here runs during gameplay, which keeps Phaser Graphics command lists out of
 * the per frame budget.
 */
(function (root) {
  'use strict';

  var PN = root.PN || (root.PN = {});
  var Art = PN.Art = {};

  var W = 390;
  var FIELD_H = 536;

  // Park geometry in park texture local space. The renderer adds FIELD_Y.
  var GEO = PN.GEO = {
    w: W,
    h: FIELD_H,
    plate: { x: 195, y: 470 },
    mound: { x: 195, y: 300 },
    wallRx: 202,
    wallRy: 302,
    trackRx: 186,
    trackRy: 279,
    crowdRx: 300,
    crowdRy: 430,
    infieldR: 132,
    zone: { x: 195, y: 452, hw: 50, hh: 58 }
  };

  PN.FIELD_Y = 76;

  function sprayPoint(spray, frac, rx, ry) {
    var a = spray * Math.PI / 180;
    return {
      x: GEO.plate.x + Math.sin(a) * rx * frac,
      y: GEO.plate.y - Math.cos(a) * ry * frac
    };
  }
  PN.sprayPoint = sprayPoint;

  // Screen point for a batted ball travelling `carry` feet at `spray` degrees.
  PN.ballGround = function (park, spray, carry) {
    var fence = PN.fenceAt(park, spray);
    var frac = carry / fence;
    return sprayPoint(spray, Math.min(frac, 1.34), GEO.wallRx, GEO.wallRy);
  };

  function mix(a, b, t) {
    function p(c) { return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]; }
    var x = p(a), y = p(b);
    function h(v) { var s = Math.round(v).toString(16); return s.length < 2 ? '0' + s : s; }
    return '#' + h(x[0] + (y[0] - x[0]) * t) + h(x[1] + (y[1] - x[1]) * t) + h(x[2] + (y[2] - x[2]) * t);
  }
  Art.mix = mix;

  function shade(c, t) { return t < 0 ? mix(c, '#000000', -t) : mix(c, '#ffffff', t); }
  Art.shade = shade;

  function rr(c, x, y, w, h, r) {
    c.beginPath();
    var rad = Math.min(r, w / 2, h / 2);
    c.moveTo(x + rad, y);
    c.arcTo(x + w, y, x + w, y + h, rad);
    c.arcTo(x + w, y + h, x, y + h, rad);
    c.arcTo(x, y + h, x, y, rad);
    c.arcTo(x, y, x + w, y, rad);
    c.closePath();
  }
  Art.rr = rr;

  function ctxOf(scene, key, w, h) {
    if (scene.textures.exists(key)) scene.textures.remove(key);
    var density = root.GGKit && root.GGKit.hiDpi ? root.GGKit.hiDpi.factor(W, 844) : 1;
    var baked = root.GGKit && root.GGKit.hiDpi ? root.GGKit.hiDpi.canvas(w, h, density) : null;
    if (baked) return { tex: { refresh: function () { scene.textures.addCanvas(key, baked.canvas); } }, c: baked.ctx };
    var tex = scene.textures.createCanvas(key, w, h);
    return { tex: tex, c: tex.getContext() };
  }

  // Deterministic scatter so a park bakes identically every boot.
  function seeded(seed) {
    var s = seed | 0 || 7;
    return function () {
      s ^= s << 13; s |= 0; s ^= s >>> 17; s ^= s << 5; s |= 0;
      return ((s >>> 0) % 100000) / 100000;
    };
  }

  // ------------------------------------------------------------- park
  function bakePark(scene, park) {
    var o = ctxOf(scene, 'park_' + park.id, W, FIELD_H);
    var c = o.c;
    var rnd = seeded(park.id.charCodeAt(0) * 977 + park.id.length * 31);
    var P = GEO.plate;

    // sky
    var g = c.createLinearGradient(0, 0, 0, 240);
    g.addColorStop(0, park.sky[0]);
    g.addColorStop(1, park.sky[1]);
    c.fillStyle = g;
    c.fillRect(0, 0, W, 260);

    if (park.roof) {
      // dome ceiling: ribs and panel gradient
      c.fillStyle = shade(park.sky[1], -0.18);
      c.beginPath();
      c.moveTo(0, 0); c.lineTo(W, 0); c.lineTo(W, 96);
      c.quadraticCurveTo(W / 2, 148, 0, 96);
      c.closePath(); c.fill();
      for (var ri = 0; ri <= 8; ri += 1) {
        var rxp = ri / 8;
        c.strokeStyle = 'rgba(255,255,255,' + (0.05 + 0.05 * Math.sin(rxp * Math.PI)) + ')';
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(W / 2, -60);
        c.quadraticCurveTo(W * rxp, 70, W * rxp, 120);
        c.stroke();
      }
      for (var li = 0; li < 14; li += 1) {
        var lx = 20 + rnd() * (W - 40), ly = 18 + rnd() * 70;
        var gl = c.createRadialGradient(lx, ly, 0, lx, ly, 14);
        gl.addColorStop(0, 'rgba(255,247,214,.85)');
        gl.addColorStop(1, 'rgba(255,247,214,0)');
        c.fillStyle = gl;
        c.beginPath(); c.arc(lx, ly, 14, 0, Math.PI * 2); c.fill();
      }
    } else if (park.night) {
      for (var si = 0; si < 90; si += 1) {
        var sx = rnd() * W, sy = rnd() * 150;
        c.fillStyle = 'rgba(255,255,255,' + (0.14 + rnd() * 0.5).toFixed(2) + ')';
        c.fillRect(sx, sy, rnd() < 0.2 ? 2 : 1, rnd() < 0.2 ? 2 : 1);
      }
      // skyline silhouette
      c.fillStyle = 'rgba(4,10,18,.82)';
      var bx = -10;
      while (bx < W + 10) {
        var bw = 16 + rnd() * 30, bh = 20 + rnd() * 52;
        c.fillRect(bx, 150 - bh, bw, bh + 20);
        for (var wy = 150 - bh + 6; wy < 150; wy += 8) {
          for (var wx = bx + 4; wx < bx + bw - 4; wx += 7) {
            if (rnd() < 0.34) {
              c.fillStyle = 'rgba(255,214,128,.5)';
              c.fillRect(wx, wy, 2, 3);
              c.fillStyle = 'rgba(4,10,18,.82)';
            }
          }
        }
        bx += bw + 2 + rnd() * 8;
      }
    } else {
      for (var ci = 0; ci < 7; ci += 1) {
        var cx = rnd() * W, cy = 18 + rnd() * 80, cr = 22 + rnd() * 30;
        var cg = c.createRadialGradient(cx, cy, 0, cx, cy, cr);
        cg.addColorStop(0, 'rgba(255,255,255,.42)');
        cg.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = cg;
        c.beginPath(); c.arc(cx, cy, cr, 0, Math.PI * 2); c.fill();
      }
      // distant treeline / rooftops beyond the wall
      c.fillStyle = 'rgba(20,52,44,.55)';
      var tx = -8;
      while (tx < W + 8) {
        var tw = 22 + rnd() * 26;
        c.beginPath();
        c.ellipse(tx, 168, tw * 0.6, 16 + rnd() * 12, 0, 0, Math.PI * 2);
        c.fill();
        tx += tw * 0.7;
      }
    }

    // light towers
    if (park.lights && !park.roof) {
      [[46, 96], [W - 46, 96]].forEach(function (t) {
        c.strokeStyle = 'rgba(18,30,38,.9)';
        c.lineWidth = 4;
        c.beginPath(); c.moveTo(t[0], t[1] + 74); c.lineTo(t[0], t[1]); c.stroke();
        c.fillStyle = '#1c2a33';
        rr(c, t[0] - 24, t[1] - 26, 48, 30, 5); c.fill();
        for (var by = 0; by < 3; by += 1) {
          for (var bxx = 0; bxx < 5; bxx += 1) {
            c.fillStyle = by === 1 ? '#fff6d0' : '#ffe9a8';
            c.fillRect(t[0] - 20 + bxx * 8, t[1] - 22 + by * 9, 6, 6);
          }
        }
        var lg = c.createRadialGradient(t[0], t[1] - 10, 0, t[0], t[1] - 10, 92);
        lg.addColorStop(0, 'rgba(255,244,208,.30)');
        lg.addColorStop(1, 'rgba(255,244,208,0)');
        c.fillStyle = lg;
        c.beginPath(); c.arc(t[0], t[1] - 10, 92, 0, Math.PI * 2); c.fill();
      });
    }

    // ------------------------------------------------ stands and crowd
    function ring(rx1, ry1, rx2, ry2) {
      c.beginPath();
      c.ellipse(P.x, P.y, rx2, ry2, 0, Math.PI, Math.PI * 2);
      c.lineTo(P.x + rx1, P.y);
      c.ellipse(P.x, P.y, rx1, ry1, 0, Math.PI * 2, Math.PI, true);
      c.closePath();
    }

    var bands = park.crowd;
    for (var bi = bands.length - 1; bi >= 0; bi -= 1) {
      var f0 = 1.02 + bi * 0.10;
      var f1 = 1.02 + (bi + 1) * 0.10;
      ring(GEO.wallRx * f0, GEO.wallRy * f0, GEO.wallRx * f1, GEO.wallRy * f1);
      c.fillStyle = park.seats;
      c.fill();
      c.save();
      c.clip();
      var count = Math.round(560 * park.capacity);
      for (var pi = 0; pi < count; pi += 1) {
        var ang = Math.PI + rnd() * Math.PI;
        var fr = f0 + rnd() * (f1 - f0);
        var px = P.x + Math.cos(ang) * GEO.wallRx * fr;
        var py = P.y + Math.sin(ang) * GEO.wallRy * fr;
        c.fillStyle = bands[(rnd() * bands.length) | 0];
        c.globalAlpha = 0.55 + rnd() * 0.45;
        c.fillRect(px, py, 2, 2);
      }
      c.globalAlpha = 1;
      // rail
      c.strokeStyle = 'rgba(255,255,255,.10)';
      c.lineWidth = 1;
      c.beginPath();
      c.ellipse(P.x, P.y, GEO.wallRx * f0, GEO.wallRy * f0, 0, Math.PI, Math.PI * 2);
      c.stroke();
      c.restore();
    }

    // ------------------------------------------------------------ wall
    ring(GEO.wallRx * 0.955, GEO.wallRy * 0.955, GEO.wallRx, GEO.wallRy);
    c.fillStyle = park.wall;
    c.fill();
    // pad seams
    c.strokeStyle = 'rgba(0,0,0,.30)';
    c.lineWidth = 1;
    for (var sa = 182; sa < 358; sa += 9) {
      var ra = sa * Math.PI / 180;
      c.beginPath();
      c.moveTo(P.x + Math.cos(ra) * GEO.wallRx * 0.955, P.y + Math.sin(ra) * GEO.wallRy * 0.955);
      c.lineTo(P.x + Math.cos(ra) * GEO.wallRx, P.y + Math.sin(ra) * GEO.wallRy);
      c.stroke();
    }
    // accent stripe on top of the wall
    c.strokeStyle = park.accent;
    c.lineWidth = Math.max(2, 2 + park.wallHeight * 1.6);
    c.beginPath();
    c.ellipse(P.x, P.y, GEO.wallRx, GEO.wallRy, 0, Math.PI, Math.PI * 2);
    c.stroke();

    // warning track
    ring(GEO.trackRx, GEO.trackRy, GEO.wallRx * 0.955, GEO.wallRy * 0.955);
    c.fillStyle = park.dirt;
    c.fill();

    // ---------------------------------------------------------- outfield
    c.beginPath();
    c.ellipse(P.x, P.y, GEO.trackRx, GEO.trackRy, 0, Math.PI, Math.PI * 2);
    c.closePath();
    c.fillStyle = park.turf;
    c.fill();
    c.save();
    c.clip();
    for (var mi = 0; mi < 11; mi += 1) {
      if (mi % 2) continue;
      var a0 = Math.PI + (mi / 11) * Math.PI;
      var a1 = Math.PI + ((mi + 1) / 11) * Math.PI;
      c.beginPath();
      c.moveTo(P.x, P.y);
      c.ellipse(P.x, P.y, GEO.trackRx, GEO.trackRy, 0, a0, a1);
      c.closePath();
      c.fillStyle = park.turfAlt;
      c.fill();
    }
    // depth shading toward the wall
    var dg = c.createLinearGradient(0, P.y - GEO.trackRy, 0, P.y);
    dg.addColorStop(0, 'rgba(0,0,0,.26)');
    dg.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = dg;
    c.fillRect(0, P.y - GEO.trackRy, W, GEO.trackRy);
    c.restore();

    // foul territory outside the lines
    c.save();
    c.beginPath();
    c.moveTo(P.x, P.y);
    var fl = sprayPoint(-46, 1.06, GEO.wallRx, GEO.wallRy);
    var frp = sprayPoint(46, 1.06, GEO.wallRx, GEO.wallRy);
    c.lineTo(fl.x, fl.y); c.lineTo(-40, fl.y); c.lineTo(-40, FIELD_H); c.lineTo(P.x, FIELD_H);
    c.closePath();
    c.fillStyle = shade(park.turf, -0.30);
    c.fill();
    c.beginPath();
    c.moveTo(P.x, P.y);
    c.lineTo(frp.x, frp.y); c.lineTo(W + 40, frp.y); c.lineTo(W + 40, FIELD_H); c.lineTo(P.x, FIELD_H);
    c.closePath();
    c.fill();
    c.restore();

    // ----------------------------------------------------------- infield
    c.beginPath();
    c.moveTo(P.x - GEO.infieldR * 1.16, P.y + 12);
    c.ellipse(P.x, P.y, GEO.infieldR * 1.16, GEO.infieldR * 1.30, 0, Math.PI, Math.PI * 2);
    c.lineTo(P.x + GEO.infieldR * 1.16, P.y + 12);
    c.closePath();
    c.fillStyle = park.dirt;
    c.fill();

    // infield grass wedge inside the base paths
    var b1 = sprayPoint(45, 0.335, GEO.wallRx, GEO.wallRy);
    var b2 = sprayPoint(0, 0.40, GEO.wallRx, GEO.wallRy);
    var b3 = sprayPoint(-45, 0.335, GEO.wallRx, GEO.wallRy);
    c.beginPath();
    c.moveTo(P.x, P.y - 10);
    c.quadraticCurveTo((P.x + b1.x) / 2 + 6, (P.y + b1.y) / 2, b1.x, b1.y);
    c.quadraticCurveTo((b1.x + b2.x) / 2 + 6, (b1.y + b2.y) / 2 - 6, b2.x, b2.y);
    c.quadraticCurveTo((b2.x + b3.x) / 2 - 6, (b2.y + b3.y) / 2 - 6, b3.x, b3.y);
    c.quadraticCurveTo((b3.x + P.x) / 2 - 6, (b3.y + P.y) / 2, P.x, P.y - 10);
    c.closePath();
    c.fillStyle = park.turfAlt;
    c.fill();

    // mound
    var mg = c.createRadialGradient(GEO.mound.x - 4, GEO.mound.y - 4, 2, GEO.mound.x, GEO.mound.y, 26);
    mg.addColorStop(0, shade(park.dirt, 0.12));
    mg.addColorStop(1, shade(park.dirt, -0.10));
    c.fillStyle = mg;
    c.beginPath();
    c.ellipse(GEO.mound.x, GEO.mound.y, 26, 12, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#f3efe2';
    c.fillRect(GEO.mound.x - 8, GEO.mound.y - 3, 16, 3);

    // foul lines and bases
    c.strokeStyle = 'rgba(255,253,244,.86)';
    c.lineWidth = 2;
    c.beginPath(); c.moveTo(P.x - 4, P.y - 2); c.lineTo(fl.x, fl.y); c.stroke();
    c.beginPath(); c.moveTo(P.x + 4, P.y - 2); c.lineTo(frp.x, frp.y); c.stroke();
    // base paths
    c.strokeStyle = 'rgba(255,253,244,.20)';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(P.x, P.y - 6); c.lineTo(b1.x, b1.y); c.lineTo(b2.x, b2.y); c.lineTo(b3.x, b3.y); c.closePath();
    c.stroke();
    [b1, b2, b3].forEach(function (b) {
      c.fillStyle = '#fffdf4';
      c.save();
      c.translate(b.x, b.y);
      c.beginPath();
      c.moveTo(0, -5); c.lineTo(7, 0); c.lineTo(0, 5); c.lineTo(-7, 0);
      c.closePath();
      c.fill();
      c.restore();
    });
    // plate and boxes
    c.fillStyle = '#fffdf4';
    c.beginPath();
    c.moveTo(P.x - 8, P.y - 4); c.lineTo(P.x + 8, P.y - 4); c.lineTo(P.x + 8, P.y + 1);
    c.lineTo(P.x, P.y + 7); c.lineTo(P.x - 8, P.y + 1);
    c.closePath();
    c.fill();
    c.strokeStyle = 'rgba(255,253,244,.5)';
    c.lineWidth = 2;
    c.strokeRect(P.x - 46, P.y - 16, 28, 40);
    c.strokeRect(P.x + 18, P.y - 16, 28, 40);

    // fence distance markers
    c.font = '700 11px ui-monospace, Menlo, monospace';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    [[-42, park.fence.left], [-22, park.fence.leftCenter], [0, park.fence.center],
      [22, park.fence.rightCenter], [42, park.fence.right]].forEach(function (m) {
      var pt = sprayPoint(m[0], 0.975, GEO.wallRx, GEO.wallRy);
      c.fillStyle = 'rgba(255,253,244,.72)';
      c.fillText(String(m[1]), pt.x, pt.y + 4);
    });

    // night tint and light pools
    if (park.night || park.roof) {
      c.fillStyle = 'rgba(10,18,34,.24)';
      c.fillRect(0, 0, W, FIELD_H);
      var pg = c.createRadialGradient(P.x, P.y - 120, 20, P.x, P.y - 90, 320);
      pg.addColorStop(0, 'rgba(255,246,214,.16)');
      pg.addColorStop(1, 'rgba(255,246,214,0)');
      c.fillStyle = pg;
      c.fillRect(0, 0, W, FIELD_H);
    }

    // vignette so the HUD band reads over the field
    var vg = c.createLinearGradient(0, FIELD_H - 120, 0, FIELD_H);
    vg.addColorStop(0, 'rgba(4,10,14,0)');
    vg.addColorStop(1, 'rgba(4,10,14,.55)');
    c.fillStyle = vg;
    c.fillRect(0, FIELD_H - 120, W, 120);

    o.tex.refresh();
  }

  // -------------------------------------------------------- crowd bands
  // A separate translucent overlay used for the crowd wave and flash pops.
  function bakeCrowdGlow(scene) {
    var o = ctxOf(scene, 'crowdglow', W, 300);
    var c = o.c;
    var g = c.createRadialGradient(W / 2, 150, 20, W / 2, 150, 260);
    g.addColorStop(0, 'rgba(255,246,214,.30)');
    g.addColorStop(0.55, 'rgba(255,246,214,.10)');
    g.addColorStop(1, 'rgba(255,246,214,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, W, 300);
    o.tex.refresh();
  }

  // ------------------------------------------------------------ figures
  function figure(c, opt) {
    // opt: {jersey, trim, skin, pose, scale}
    var s = opt.scale || 1;
    c.save();
    c.scale(s, s);
    var jersey = opt.jersey, trim = opt.trim, skin = opt.skin || '#e9c19b';
    function limb(x1, y1, x2, y2, w, col) {
      c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'round';
      c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
    }
    var p = opt.pose;
    // shadow
    c.fillStyle = 'rgba(0,0,0,.28)';
    c.beginPath(); c.ellipse(0, 1, 11, 3.4, 0, 0, Math.PI * 2); c.fill();

    if (p === 'idle' || p === 'load') {
      var lean = p === 'load' ? -2.4 : 0;
      limb(-3, -1, -4 + lean, -13, 5, jersey);
      limb(4, -1, 3 + lean, -13, 5, jersey);
      c.fillStyle = jersey;
      rr(c, -7 + lean, -27, 14, 15, 4); c.fill();
      c.fillStyle = trim;
      c.fillRect(-7 + lean, -22, 14, 2.4);
      limb(-5 + lean, -24, -11 + lean, (p === 'load' ? -30 : -27), 4, jersey);
      limb(5 + lean, -24, 10 + lean, (p === 'load' ? -31 : -28), 4, jersey);
      c.fillStyle = skin;
      c.beginPath(); c.arc(lean, -32, 5.2, 0, Math.PI * 2); c.fill();
      c.fillStyle = trim;
      c.beginPath(); c.arc(lean, -33.4, 5.4, Math.PI, Math.PI * 2); c.fill();
      c.fillRect(lean - 1, -34.6, 8, 2);
      // bat
      c.strokeStyle = '#d8a55f'; c.lineWidth = 3; c.lineCap = 'round';
      c.beginPath();
      if (p === 'load') { c.moveTo(10 + lean, -31); c.lineTo(19 + lean, -47); }
      else { c.moveTo(10, -28); c.lineTo(16, -45); }
      c.stroke();
    } else if (p === 'swing' || p === 'follow') {
      var t = p === 'swing' ? 0 : 1;
      limb(-5, -1, -7, -13, 5, jersey);
      limb(5, -1, 8, -13, 5, jersey);
      c.save();
      c.rotate(t ? -0.34 : 0.12);
      c.fillStyle = jersey;
      rr(c, -8, -27, 16, 15, 4); c.fill();
      c.fillStyle = trim;
      c.fillRect(-8, -22, 16, 2.4);
      c.restore();
      c.fillStyle = skin;
      c.beginPath(); c.arc(t ? -3 : 1, -32, 5.2, 0, Math.PI * 2); c.fill();
      c.fillStyle = trim;
      c.beginPath(); c.arc(t ? -3 : 1, -33.4, 5.4, Math.PI, Math.PI * 2); c.fill();
      // arms plus bat sweeping through the zone
      c.strokeStyle = jersey; c.lineWidth = 4;
      if (t) {
        c.beginPath(); c.moveTo(-4, -24); c.lineTo(-16, -20); c.stroke();
        c.strokeStyle = '#d8a55f'; c.lineWidth = 3;
        c.beginPath(); c.moveTo(-16, -20); c.lineTo(-25, -32); c.stroke();
      } else {
        c.beginPath(); c.moveTo(4, -24); c.lineTo(17, -25); c.stroke();
        c.strokeStyle = '#d8a55f'; c.lineWidth = 3;
        c.beginPath(); c.moveTo(17, -25); c.lineTo(31, -24); c.stroke();
      }
    } else if (p === 'trot' || p === 'run') {
      var sw = p === 'run' ? 8 : 5;
      limb(-1, -1, -sw, -12, 5, jersey);
      limb(1, -1, sw, -12, 5, jersey);
      c.fillStyle = jersey;
      rr(c, -6, -26, 13, 15, 4); c.fill();
      c.fillStyle = trim;
      c.fillRect(-6, -21, 13, 2.4);
      limb(-4, -23, -12, -18, 4, jersey);
      limb(4, -23, 11, -28, 4, jersey);
      c.fillStyle = skin;
      c.beginPath(); c.arc(0.5, -31, 5, 0, Math.PI * 2); c.fill();
      c.fillStyle = trim;
      c.beginPath(); c.arc(0.5, -32.4, 5.2, Math.PI, Math.PI * 2); c.fill();
    } else if (p === 'set' || p === 'windup' || p === 'release') {
      var k = p === 'windup' ? 1 : p === 'release' ? 2 : 0;
      if (k === 1) {
        limb(-1, -1, -3, -12, 5, jersey);
        limb(2, -6, 9, -16, 5, jersey);
      } else if (k === 2) {
        limb(-4, -1, -10, -11, 5, jersey);
        limb(4, -1, 10, -12, 5, jersey);
      } else {
        limb(-2, -1, -3, -12, 5, jersey);
        limb(3, -1, 4, -12, 5, jersey);
      }
      c.fillStyle = jersey;
      rr(c, -6, -25, 12, 14, 4); c.fill();
      c.fillStyle = trim;
      c.fillRect(-6, -20, 12, 2.2);
      if (k === 2) {
        limb(3, -22, 15, -30, 4, jersey);
        c.fillStyle = '#fffdf4';
        c.beginPath(); c.arc(17, -31, 2.6, 0, Math.PI * 2); c.fill();
      } else if (k === 1) {
        limb(-3, -22, -9, -32, 4, jersey);
      } else {
        limb(-3, -22, -7, -16, 4, jersey);
        limb(3, -22, 6, -16, 4, jersey);
      }
      c.fillStyle = skin;
      c.beginPath(); c.arc(0, -29.5, 4.8, 0, Math.PI * 2); c.fill();
      c.fillStyle = trim;
      c.beginPath(); c.arc(0, -30.8, 5, Math.PI, Math.PI * 2); c.fill();
    } else if (p === 'catch' || p === 'dive') {
      if (p === 'dive') {
        c.save(); c.rotate(-0.9);
        c.fillStyle = jersey; rr(c, -6, -24, 13, 14, 4); c.fill();
        c.fillStyle = trim; c.fillRect(-6, -19, 13, 2.2);
        c.restore();
        limb(-2, -2, -14, 2, 4.4, jersey);
        limb(2, -6, 14, -18, 4, jersey);
        c.fillStyle = '#c98f52';
        c.beginPath(); c.arc(16, -20, 4.4, 0, Math.PI * 2); c.fill();
        c.fillStyle = skin;
        c.beginPath(); c.arc(-9, -14, 4.6, 0, Math.PI * 2); c.fill();
      } else {
        limb(-3, -1, -5, -12, 5, jersey);
        limb(3, -1, 5, -12, 5, jersey);
        c.fillStyle = jersey; rr(c, -6, -25, 12, 14, 4); c.fill();
        c.fillStyle = trim; c.fillRect(-6, -20, 12, 2.2);
        limb(-3, -23, -8, -34, 4, jersey);
        limb(3, -23, 8, -34, 4, jersey);
        c.fillStyle = '#c98f52';
        c.beginPath(); c.arc(9, -36, 5, 0, Math.PI * 2); c.fill();
        c.fillStyle = skin;
        c.beginPath(); c.arc(0, -30, 4.8, 0, Math.PI * 2); c.fill();
      }
      c.fillStyle = trim;
      c.beginPath(); c.arc(0, -31.4, 5, Math.PI, Math.PI * 2); c.fill();
    } else if (p === 'catcher') {
      c.fillStyle = jersey;
      rr(c, -11, -22, 22, 20, 6); c.fill();
      c.fillStyle = trim;
      rr(c, -8, -18, 16, 5, 2); c.fill();
      limb(-11, -6, -18, 2, 6, jersey);
      limb(11, -8, 20, -14, 6, jersey);
      c.fillStyle = '#c98f52';
      c.beginPath(); c.arc(22, -16, 6.4, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#20323c';
      c.beginPath(); c.arc(0, -27, 6.4, 0, Math.PI * 2); c.fill();
      c.strokeStyle = 'rgba(220,235,235,.7)'; c.lineWidth = 1;
      for (var gi = -4; gi <= 4; gi += 3) {
        c.beginPath(); c.moveTo(gi, -33); c.lineTo(gi, -22); c.stroke();
      }
    } else if (p === 'ump') {
      c.fillStyle = '#1b2b33';
      rr(c, -8, -24, 16, 18, 5); c.fill();
      limb(-8, -8, -14, 0, 5, '#1b2b33');
      limb(8, -8, 14, 0, 5, '#1b2b33');
      c.fillStyle = '#101c22';
      c.beginPath(); c.arc(0, -29, 6, 0, Math.PI * 2); c.fill();
    }
    c.restore();
  }

  function bakeFigure(scene, key, opt, w, h, ox, oy) {
    var o = ctxOf(scene, key, w, h);
    o.c.save();
    o.c.translate(ox, oy);
    figure(o.c, opt);
    o.c.restore();
    o.tex.refresh();
  }

  // ---------------------------------------------------------- particles
  function bakeDot(scene, key, size, inner, outer) {
    var o = ctxOf(scene, key, size, size);
    var c = o.c;
    var g = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, inner);
    g.addColorStop(1, outer);
    c.fillStyle = g;
    c.fillRect(0, 0, size, size);
    o.tex.refresh();
  }

  function bakeChip(scene, key, w, h, fill, stroke, radius, glow) {
    var o = ctxOf(scene, key, w, h);
    var c = o.c;
    if (glow) {
      c.shadowColor = glow;
      c.shadowBlur = 10;
    }
    rr(c, 1.5, 1.5, w - 3, h - 3, radius);
    c.fillStyle = fill;
    c.fill();
    c.shadowBlur = 0;
    if (stroke) {
      c.strokeStyle = stroke;
      c.lineWidth = 1.6;
      c.stroke();
    }
    o.tex.refresh();
  }
  Art.bakeChip = bakeChip;

  function bakeBall(scene) {
    var o = ctxOf(scene, 'ball', 26, 26);
    var c = o.c;
    var g = c.createRadialGradient(10, 9, 1, 13, 13, 12);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.7, '#fffdf4');
    g.addColorStop(1, '#d9d2c0');
    c.fillStyle = g;
    c.beginPath(); c.arc(13, 13, 11.4, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(20,40,44,.55)';
    c.lineWidth = 1.2;
    c.beginPath(); c.arc(13, 13, 11.4, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = '#ff7861';
    c.lineWidth = 1.5;
    c.beginPath(); c.arc(2, 13, 11, -0.75, 0.75); c.stroke();
    c.beginPath(); c.arc(24, 13, 11, Math.PI - 0.75, Math.PI + 0.75); c.stroke();
    o.tex.refresh();
  }

  function bakeZone(scene) {
    var Z = GEO.zone;
    var w = Z.hw * 2 + 16, h = Z.hh * 2 + 16;
    var o = ctxOf(scene, 'zonebox', w, h);
    var c = o.c;
    c.strokeStyle = 'rgba(134,228,213,.55)';
    c.lineWidth = 2;
    c.strokeRect(8, 8, Z.hw * 2, Z.hh * 2);
    c.strokeStyle = 'rgba(134,228,213,.22)';
    c.lineWidth = 1;
    for (var i = 1; i < 3; i += 1) {
      c.beginPath(); c.moveTo(8 + (Z.hw * 2 / 3) * i, 8); c.lineTo(8 + (Z.hw * 2 / 3) * i, 8 + Z.hh * 2); c.stroke();
      c.beginPath(); c.moveTo(8, 8 + (Z.hh * 2 / 3) * i); c.lineTo(8 + Z.hw * 2, 8 + (Z.hh * 2 / 3) * i); c.stroke();
    }
    // corner ticks
    c.strokeStyle = 'rgba(201,255,98,.85)';
    c.lineWidth = 2.4;
    var L = 11;
    [[8, 8, 1, 1], [8 + Z.hw * 2, 8, -1, 1], [8, 8 + Z.hh * 2, 1, -1], [8 + Z.hw * 2, 8 + Z.hh * 2, -1, -1]]
      .forEach(function (k) {
        c.beginPath(); c.moveTo(k[0], k[1] + k[3] * L); c.lineTo(k[0], k[1]); c.lineTo(k[0] + k[2] * L, k[1]); c.stroke();
      });
    o.tex.refresh();
  }

  function bakeHud(scene) {
    var o = ctxOf(scene, 'hudband', W, 84);
    var c = o.c;
    var g = c.createLinearGradient(0, 0, 0, 84);
    g.addColorStop(0, 'rgba(7,17,22,.96)');
    g.addColorStop(1, 'rgba(9,26,32,.90)');
    c.fillStyle = g;
    rr(c, 0, -14, W, 96, 16);
    c.fill();
    c.strokeStyle = 'rgba(134,228,213,.24)';
    c.lineWidth = 1;
    c.beginPath(); c.moveTo(10, 81.5); c.lineTo(W - 10, 81.5); c.stroke();
    c.strokeStyle = 'rgba(201,255,98,.5)';
    c.lineWidth = 2;
    c.beginPath(); c.moveTo(14, 82.5); c.lineTo(120, 82.5); c.stroke();
    o.tex.refresh();
  }

  function bakePanel(scene, key, w, h, alpha) {
    var o = ctxOf(scene, key, w, h);
    var c = o.c;
    var g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(17,38,47,' + alpha + ')');
    g.addColorStop(1, 'rgba(10,23,30,' + alpha + ')');
    rr(c, 1, 1, w - 2, h - 2, 14);
    c.fillStyle = g;
    c.fill();
    c.strokeStyle = 'rgba(134,228,213,.20)';
    c.lineWidth = 1.4;
    c.stroke();
    o.tex.refresh();
  }
  Art.bakePanel = bakePanel;

  function bakeMark(scene, team) {
    var o = ctxOf(scene, 'mark_' + team.id, 40, 40);
    var c = o.c;
    c.translate(20, 20);
    c.fillStyle = team.color;
    c.strokeStyle = team.alt;
    c.lineWidth = 2;
    var m = team.mark, i;
    if (m === 'star') {
      c.beginPath();
      for (i = 0; i < 10; i += 1) {
        var r = i % 2 ? 6.5 : 15;
        var a = -Math.PI / 2 + i * Math.PI / 5;
        c[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r);
      }
      c.closePath(); c.fill();
    } else if (m === 'bolt') {
      c.beginPath();
      c.moveTo(3, -15); c.lineTo(-9, 2); c.lineTo(-1, 2); c.lineTo(-4, 15); c.lineTo(9, -3);
      c.lineTo(1, -3); c.closePath(); c.fill();
    } else if (m === 'owl') {
      c.beginPath(); c.ellipse(0, 2, 11, 13, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = team.alt;
      c.beginPath(); c.moveTo(-11, -8); c.lineTo(-6, -16); c.lineTo(-2, -9); c.closePath(); c.fill();
      c.beginPath(); c.moveTo(11, -8); c.lineTo(6, -16); c.lineTo(2, -9); c.closePath(); c.fill();
      c.fillStyle = '#071116';
      c.beginPath(); c.arc(-4, -1, 3, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(4, -1, 3, 0, Math.PI * 2); c.fill();
    } else if (m === 'wave') {
      c.lineWidth = 3.4;
      c.strokeStyle = team.color;
      for (i = -1; i <= 1; i += 1) {
        c.beginPath();
        c.moveTo(-14, i * 8);
        c.quadraticCurveTo(-4, i * 8 - 7, 2, i * 8);
        c.quadraticCurveTo(8, i * 8 + 7, 15, i * 8);
        c.stroke();
      }
    } else if (m === 'comet') {
      c.beginPath(); c.arc(5, -3, 7, 0, Math.PI * 2); c.fill();
      c.strokeStyle = team.color;
      c.lineWidth = 3;
      for (i = 0; i < 3; i += 1) {
        c.globalAlpha = 0.8 - i * 0.22;
        c.beginPath(); c.moveTo(-1, 2 + i * 5); c.lineTo(-15, 8 + i * 5); c.stroke();
      }
      c.globalAlpha = 1;
    } else {
      c.beginPath();
      c.moveTo(-13, 6); c.quadraticCurveTo(-2, -16, 13, -8);
      c.quadraticCurveTo(4, -2, 6, 10);
      c.quadraticCurveTo(-2, 4, -13, 6);
      c.closePath(); c.fill();
    }
    o.tex.refresh();
  }

  // -------------------------------------------------------------- bake
  Art.bakeAll = function (scene, onStep) {
    var steps = [];
    PN.PARKS.forEach(function (p) { steps.push(function () { bakePark(scene, p); }); });
    PN.TEAMS.forEach(function (t) { steps.push(function () { bakeMark(scene, t); }); });
    steps.push(function () {
      bakeBall(scene);
      bakeZone(scene);
      bakeHud(scene);
      bakeCrowdGlow(scene);
    });
    steps.push(function () {
      var home = { jersey: '#eef4ee', trim: PN.COLORS.lime, skin: '#e9c19b' };
      ['idle', 'load', 'swing', 'follow', 'trot'].forEach(function (pose) {
        bakeFigure(scene, 'bat_' + pose, { jersey: home.jersey, trim: home.trim, pose: pose }, 80, 60, 40, 54);
      });
      ['set', 'windup', 'release'].forEach(function (pose) {
        bakeFigure(scene, 'pit_' + pose, { jersey: '#dfe8ea', trim: '#8bb0c0', pose: pose, scale: 0.78 }, 60, 46, 30, 42);
      });
      ['run', 'catch', 'dive'].forEach(function (pose) {
        bakeFigure(scene, 'fld_' + pose, { jersey: '#dfe8ea', trim: '#8bb0c0', pose: pose, scale: 0.62 }, 60, 40, 30, 34);
      });
      bakeFigure(scene, 'catcher', { jersey: '#dfe8ea', trim: '#8bb0c0', pose: 'catcher', scale: 1.0 }, 70, 50, 26, 44);
      bakeFigure(scene, 'ump', { jersey: '#1b2b33', trim: '#1b2b33', pose: 'ump', scale: 1.0 }, 60, 46, 30, 42);
      ['idle', 'trot', 'run'].forEach(function (pose) {
        bakeFigure(scene, 'away_' + pose, { jersey: '#f0d9c8', trim: '#c96a3c', pose: pose, scale: 0.9 }, 80, 60, 40, 54);
      });
    });
    steps.push(function () {
      bakeDot(scene, 'p_soft', 24, 'rgba(255,255,255,.95)', 'rgba(255,255,255,0)');
      bakeDot(scene, 'p_spark', 16, 'rgba(255,247,214,1)', 'rgba(255,180,90,0)');
      bakeDot(scene, 'p_dirt', 14, 'rgba(196,150,104,1)', 'rgba(140,96,60,0)');
      bakeDot(scene, 'p_grass', 10, 'rgba(120,200,140,1)', 'rgba(60,120,80,0)');
      var o = ctxOf(scene, 'p_confetti', 10, 14);
      o.c.fillStyle = '#ffffff';
      o.c.fillRect(1, 1, 8, 12);
      o.tex.refresh();
      var f = ctxOf(scene, 'p_flash', 12, 12);
      f.c.fillStyle = '#ffffff';
      f.c.fillRect(2, 2, 8, 8);
      f.tex.refresh();
      bakeChip(scene, 'btn_lg', 220, 56, 'rgba(24,51,59,.94)', 'rgba(134,228,213,.42)', 16);
      bakeChip(scene, 'btn_lg_on', 220, 56, 'rgba(201,255,98,.94)', 'rgba(201,255,98,1)', 16, 'rgba(201,255,98,.55)');
      bakeChip(scene, 'btn_md', 118, 48, 'rgba(24,51,59,.92)', 'rgba(134,228,213,.34)', 14);
      bakeChip(scene, 'btn_md_on', 118, 48, 'rgba(201,255,98,.92)', 'rgba(201,255,98,1)', 14, 'rgba(201,255,98,.5)');
      bakeChip(scene, 'btn_sm', 86, 44, 'rgba(24,51,59,.90)', 'rgba(134,228,213,.30)', 12);
      bakeChip(scene, 'btn_sm_on', 86, 44, 'rgba(255,211,107,.92)', 'rgba(255,211,107,1)', 12, 'rgba(255,211,107,.5)');
      bakeChip(scene, 'btn_action', 132, 132, 'rgba(201,255,98,.16)', 'rgba(201,255,98,.85)', 66);
      bakeChip(scene, 'btn_action_on', 132, 132, 'rgba(201,255,98,.92)', 'rgba(255,253,244,1)', 66, 'rgba(201,255,98,.7)');
      bakeChip(scene, 'chip_toast', 240, 34, 'rgba(7,17,22,.90)', 'rgba(134,228,213,.34)', 12);
      bakePanel(scene, 'panel_full', 358, 470, 0.94);
      bakePanel(scene, 'panel_mid', 340, 250, 0.94);
      bakePanel(scene, 'panel_row', 358, 34, 0.55);
      bakePanel(scene, 'panel_ctl', 390, 252, 0.88);
      // every menu panel size the screens ask for, baked up front so no menu
      // build uploads a fresh canvas texture mid session
      [[358, 700], [358, 640], [358, 470], [358, 430], [358, 360], [358, 340]]
        .forEach(function (s) { bakePanel(scene, 'mpanel_' + s[0] + '_' + s[1], s[0], s[1], 0.94); });
    });
    var i = 0;
    return function pump() {
      if (i >= steps.length) return true;
      steps[i]();
      i += 1;
      if (onStep) onStep(i / steps.length);
      return i >= steps.length;
    };
  };

  Art.stepCount = PN.PARKS.length + PN.TEAMS.length + 4;

  if (typeof module !== 'undefined' && module.exports) module.exports = Art;
})(typeof window !== 'undefined' ? window : globalThis);
