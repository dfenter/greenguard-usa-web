/* Hivefall - texture bakery.
 *
 * Phaser Graphics replays its entire command list every frame, so nothing
 * static is ever left as a Graphics object: the board frame, cell field, lane
 * track, wall, sky, HUD chrome, pieces, horde silhouettes, particles and icons
 * are all drawn ONCE into canvas textures here and shown as images.
 */
var HFArt = (function () {
  'use strict';
  var A = {};

  var TILE = 96;                 /* bake size of a board piece */
  var MOB = 112;                 /* bake size of a horde silhouette */
  A.TILE = TILE;
  A.MOB = MOB;

  function hex(n) { return '#' + ('000000' + ((n >>> 0) & 0xFFFFFF).toString(16)).slice(-6); }
  A.hex = hex;

  function mix(a, b, t) {
    var ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
    var br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
    return (((ar + (br - ar) * t) | 0) << 16) | (((ag + (bg - ag) * t) | 0) << 8) | ((ab + (bb - ab) * t) | 0);
  }
  A.mix = mix;
  A.lighten = function (c, t) { return mix(c, 0xFFFFFF, t); };
  A.darken = function (c, t) { return mix(c, 0x000000, t); };

  function lum(c) {
    var r = ((c >> 16) & 255) / 255, g = ((c >> 8) & 255) / 255, b = (c & 255) / 255;
    function f(v) { return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  }
  A.lum = lum;
  function inkFor(c) { return lum(c) > 0.42 ? '#141C2B' : '#F7FBFF'; }

  /* create (or replace) a canvas texture and hand over its 2d context */
  function tex(scene, key, w, h, draw) {
    w = Math.max(1, Math.ceil(w)); h = Math.max(1, Math.ceil(h));
    if (scene.textures.exists(key)) scene.textures.remove(key);
    var ct = scene.textures.createCanvas(key, w, h);
    if (!ct) return null;
    var ctx = ct.getContext();
    ctx.clearRect(0, 0, w, h);
    draw(ctx, w, h);
    ct.refresh();
    return ct;
  }
  A.tex = tex;

  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
  A.roundRect = rr;

  function poly(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
  }

  function hexPts(cx, cy, r, rot) {
    var p = [];
    for (var i = 0; i < 6; i++) {
      var a = (rot || 0) + i * Math.PI / 3;
      p.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    return p;
  }
  A.hexPts = hexPts;

  function vgrad(ctx, x, y, w, h, top, bot) {
    var g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, hex(top)); g.addColorStop(1, hex(bot));
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
  }
  A.vgrad = vgrad;

  /* ------------------------------------------------------------ shapes -- */
  function pieceShape(ctx, shape, cx, cy, r) {
    switch (shape) {
      case 'hex':
        poly(ctx, hexPts(cx, cy, r, Math.PI / 6));
        break;
      case 'shield':
        ctx.beginPath();
        ctx.moveTo(cx - r * 0.92, cy - r * 0.82);
        ctx.lineTo(cx + r * 0.92, cy - r * 0.82);
        ctx.lineTo(cx + r * 0.92, cy + r * 0.16);
        ctx.quadraticCurveTo(cx + r * 0.82, cy + r * 0.92, cx, cy + r);
        ctx.quadraticCurveTo(cx - r * 0.82, cy + r * 0.92, cx - r * 0.92, cy + r * 0.16);
        ctx.closePath();
        break;
      case 'square':
        rr(ctx, cx - r * 0.88, cy - r * 0.88, r * 1.76, r * 1.76, r * 0.26);
        break;
      case 'diamond':
        poly(ctx, [[cx, cy - r], [cx + r * 0.88, cy], [cx, cy + r], [cx - r * 0.88, cy]]);
        break;
      case 'flask':
        ctx.beginPath();
        ctx.moveTo(cx - r * 0.34, cy - r * 0.95);
        ctx.lineTo(cx + r * 0.34, cy - r * 0.95);
        ctx.lineTo(cx + r * 0.34, cy - r * 0.34);
        ctx.lineTo(cx + r * 0.92, cy + r * 0.72);
        ctx.quadraticCurveTo(cx + r * 0.98, cy + r * 0.98, cx + r * 0.62, cy + r * 0.98);
        ctx.lineTo(cx - r * 0.62, cy + r * 0.98);
        ctx.quadraticCurveTo(cx - r * 0.98, cy + r * 0.98, cx - r * 0.92, cy + r * 0.72);
        ctx.lineTo(cx - r * 0.34, cy - r * 0.34);
        ctx.closePath();
        break;
      default:
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.closePath();
    }
  }

  function glyph(ctx, kind, cx, cy, r, color) {
    ctx.save();
    ctx.strokeStyle = color; ctx.fillStyle = color;
    ctx.lineWidth = Math.max(2, r * 0.20);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    var i, a;
    switch (kind) {
      case 'shell':                    /* cannon: a stubby shell pointing up */
        ctx.beginPath();
        ctx.moveTo(cx, cy - r);
        ctx.quadraticCurveTo(cx + r * 0.62, cy - r * 0.30, cx + r * 0.52, cy + r * 0.42);
        ctx.lineTo(cx - r * 0.52, cy + r * 0.42);
        ctx.quadraticCurveTo(cx - r * 0.62, cy - r * 0.30, cx, cy - r);
        ctx.closePath(); ctx.fill();
        ctx.fillRect(cx - r * 0.60, cy + r * 0.52, r * 1.20, r * 0.30);
        break;
      case 'cross':                    /* repair: a thick medical cross */
        ctx.fillRect(cx - r * 0.26, cy - r * 0.90, r * 0.52, r * 1.80);
        ctx.fillRect(cx - r * 0.90, cy - r * 0.26, r * 1.80, r * 0.52);
        break;
      case 'gear':                     /* salvage: a cut gear */
        ctx.beginPath();
        for (i = 0; i < 8; i++) {
          a = i * Math.PI / 4;
          var ro = (i % 2 === 0) ? r * 0.94 : r * 0.62;
          var x = cx + ro * Math.cos(a), y = cy + ro * Math.sin(a);
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath(); ctx.fill();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath(); ctx.arc(cx, cy, r * 0.30, 0, Math.PI * 2); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        break;
      case 'flake':                    /* frost: six-arm flake */
        for (i = 0; i < 3; i++) {
          a = i * Math.PI / 3;
          ctx.beginPath();
          ctx.moveTo(cx - r * 0.92 * Math.cos(a), cy - r * 0.92 * Math.sin(a));
          ctx.lineTo(cx + r * 0.92 * Math.cos(a), cy + r * 0.92 * Math.sin(a));
          ctx.stroke();
        }
        for (i = 0; i < 6; i++) {
          a = i * Math.PI / 3;
          var bx = cx + r * 0.62 * Math.cos(a), by = cy + r * 0.62 * Math.sin(a);
          ctx.beginPath();
          ctx.moveTo(bx, by);
          ctx.lineTo(bx + r * 0.26 * Math.cos(a + 0.9), by + r * 0.26 * Math.sin(a + 0.9));
          ctx.stroke();
        }
        break;
      case 'drop':                     /* venom: a falling droplet */
        ctx.beginPath();
        ctx.moveTo(cx, cy - r * 0.95);
        ctx.quadraticCurveTo(cx + r * 0.85, cy + r * 0.18, cx, cy + r * 0.88);
        ctx.quadraticCurveTo(cx - r * 0.85, cy + r * 0.18, cx, cy - r * 0.95);
        ctx.closePath(); ctx.fill();
        break;
      case 'wall':
        ctx.fillRect(cx - r * 0.92, cy - r * 0.5, r * 1.84, r * 0.42);
        ctx.fillRect(cx - r * 0.92, cy + r * 0.10, r * 1.84, r * 0.42);
        break;
      case 'eye':
        ctx.beginPath();
        ctx.moveTo(cx - r, cy);
        ctx.quadraticCurveTo(cx, cy - r * 0.86, cx + r, cy);
        ctx.quadraticCurveTo(cx, cy + r * 0.86, cx - r, cy);
        ctx.closePath(); ctx.stroke();
        ctx.beginPath(); ctx.arc(cx, cy, r * 0.30, 0, Math.PI * 2); ctx.fill();
        break;
      case 'spark':
        ctx.beginPath();
        ctx.moveTo(cx + r * 0.18, cy - r);
        ctx.lineTo(cx - r * 0.52, cy + r * 0.12);
        ctx.lineTo(cx - r * 0.02, cy + r * 0.12);
        ctx.lineTo(cx - r * 0.20, cy + r);
        ctx.lineTo(cx + r * 0.56, cy - r * 0.16);
        ctx.lineTo(cx + r * 0.04, cy - r * 0.16);
        ctx.closePath(); ctx.fill();
        break;
      case 'vent':
        for (i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.moveTo(cx - r * 0.86, cy - r * 0.6 + i * r * 0.6);
          ctx.lineTo(cx + r * 0.86, cy - r * 0.6 + i * r * 0.6);
          ctx.stroke();
        }
        break;
      case 'brick':
        ctx.fillRect(cx - r * 0.92, cy - r * 0.78, r * 1.84, r * 0.5);
        ctx.fillRect(cx - r * 0.92, cy - r * 0.16, r * 0.82, r * 0.5);
        ctx.fillRect(cx + r * 0.06, cy - r * 0.16, r * 0.86, r * 0.5);
        ctx.fillRect(cx - r * 0.92, cy + r * 0.46, r * 1.84, r * 0.5);
        break;
      case 'flame':
        ctx.beginPath();
        ctx.moveTo(cx, cy - r);
        ctx.quadraticCurveTo(cx + r * 0.34, cy - r * 0.52, cx + r * 0.50, cy - r * 0.10);
        ctx.quadraticCurveTo(cx + r * 0.98, cy + r * 0.40, cx + r * 0.34, cy + r * 0.86);
        ctx.quadraticCurveTo(cx, cy + r * 1.04, cx - r * 0.34, cy + r * 0.86);
        ctx.quadraticCurveTo(cx - r * 0.98, cy + r * 0.40, cx - r * 0.44, cy - r * 0.22);
        ctx.quadraticCurveTo(cx - r * 0.30, cy + r * 0.16, cx - r * 0.10, cy + r * 0.22);
        ctx.quadraticCurveTo(cx - r * 0.30, cy - r * 0.42, cx, cy - r);
        ctx.closePath(); ctx.fill();
        break;
      case 'flare':
        ctx.beginPath(); ctx.arc(cx, cy, r * 0.34, 0, Math.PI * 2); ctx.fill();
        for (i = 0; i < 8; i++) {
          a = i * Math.PI / 4;
          ctx.beginPath();
          ctx.moveTo(cx + r * 0.5 * Math.cos(a), cy + r * 0.5 * Math.sin(a));
          ctx.lineTo(cx + r * 0.98 * Math.cos(a), cy + r * 0.98 * Math.sin(a));
          ctx.stroke();
        }
        break;
      case 'chevron':
        for (i = 0; i < 2; i++) {
          ctx.beginPath();
          ctx.moveTo(cx - r * 0.72, cy + r * (0.24 - i * 0.58));
          ctx.lineTo(cx, cy - r * (0.28 + i * 0.58));
          ctx.lineTo(cx + r * 0.72, cy + r * (0.24 - i * 0.58));
          ctx.stroke();
        }
        break;
      default:
        ctx.beginPath(); ctx.arc(cx, cy, r * 0.7, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  A.glyph = glyph;

  /* ------------------------------------------------------------ pieces -- */
  function bakePiece(scene, sq, charged) {
    var key = 'hf_p_' + sq.key + (charged ? '_chg' : '');
    tex(scene, key, TILE, TILE, function (ctx, w, h) {
      var cx = w / 2, cy = h / 2, r = w * 0.40;
      /* contact shadow */
      ctx.save();
      ctx.globalAlpha = 0.34;
      ctx.fillStyle = '#080C14';
      pieceShape(ctx, sq.shape, cx, cy + r * 0.16, r * 1.02);
      ctx.fill();
      ctx.restore();
      /* body with a fake-lambert vertical ramp */
      var gr = ctx.createLinearGradient(0, cy - r, 0, cy + r);
      gr.addColorStop(0, hex(A.lighten(sq.color, charged ? 0.42 : 0.26)));
      gr.addColorStop(0.55, hex(sq.color));
      gr.addColorStop(1, hex(A.darken(sq.color, 0.24)));
      pieceShape(ctx, sq.shape, cx, cy, r);
      ctx.fillStyle = gr; ctx.fill();
      /* edge */
      ctx.strokeStyle = hex(charged ? 0xFFFFFF : sq.edge);
      ctx.lineWidth = charged ? 5 : 4;
      ctx.stroke();
      /* top highlight sliver */
      ctx.save();
      pieceShape(ctx, sq.shape, cx, cy, r);
      ctx.clip();
      ctx.globalAlpha = 0.30;
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.ellipse(cx, cy - r * 0.72, r * 0.72, r * 0.30, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      /* symbol: triple coding, never hue alone */
      glyph(ctx, sq.glyph, cx, cy + r * 0.02, r * 0.50, inkFor(sq.color));
      if (charged) {
        ctx.save();
        ctx.strokeStyle = '#FFF6D8'; ctx.lineWidth = 3; ctx.globalAlpha = 0.9;
        pieceShape(ctx, sq.shape, cx, cy, r * 1.14);
        ctx.stroke();
        ctx.restore();
      }
    });
    return key;
  }

  /* hazard coats, one texture per act hazard and layer count */
  function bakeHazard(scene, act) {
    var def = act.hazard;
    for (var layer = 1; layer <= def.layers; layer++) {
      (function (layer) {
        tex(scene, 'hf_haz_' + def.key + '_' + layer, TILE, TILE, function (ctx, w, h) {
          var cx = w / 2, cy = h / 2, r = w * 0.44;
          var base = def.color;
          ctx.save();
          rr(ctx, cx - r, cy - r, r * 2, r * 2, r * 0.28);
          ctx.clip();
          ctx.fillStyle = hex(A.darken(base, 0.18));
          ctx.fillRect(0, 0, w, h);
          ctx.globalAlpha = 0.55;
          ctx.fillStyle = hex(A.lighten(base, 0.30));
          var i;
          if (def.key === 'bramble') {
            ctx.lineWidth = 6; ctx.strokeStyle = hex(A.darken(base, 0.42));
            for (i = -2; i < 5; i++) {
              ctx.beginPath();
              ctx.moveTo(cx - r + i * 22, cy - r);
              ctx.lineTo(cx - r + i * 22 + 34, cy + r);
              ctx.stroke();
            }
            ctx.fillStyle = hex(A.lighten(base, 0.5));
            for (i = 0; i < 5; i++) {
              ctx.beginPath();
              ctx.arc(cx - r + 14 + i * 18, cy - r + 22 + (i % 2) * 30, 4.5, 0, Math.PI * 2);
              ctx.fill();
            }
          } else if (def.key === 'sludge') {
            for (i = 0; i < 7; i++) {
              ctx.beginPath();
              ctx.arc(cx - r + 12 + (i * 27) % (r * 2), cy - r + 16 + (i * 41) % (r * 1.7), 12 - i, 0, Math.PI * 2);
              ctx.fill();
            }
          } else if (def.key === 'spore') {
            for (i = 0; i < 9; i++) {
              var a = i * 0.7;
              ctx.beginPath();
              ctx.arc(cx + Math.cos(a) * r * 0.55, cy + Math.sin(a) * r * 0.55, 7, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.beginPath(); ctx.arc(cx, cy, r * 0.30, 0, Math.PI * 2); ctx.fill();
          } else {
            for (i = 0; i < 4; i++) {
              poly(ctx, hexPts(cx - r * 0.45 + (i % 2) * r * 0.9, cy - r * 0.45 + ((i / 2) | 0) * r * 0.9, r * 0.42, Math.PI / 6));
              ctx.fill();
            }
          }
          ctx.restore();
          ctx.globalAlpha = 1;
          ctx.strokeStyle = hex(A.lighten(base, 0.45));
          ctx.lineWidth = 4;
          rr(ctx, cx - r, cy - r, r * 2, r * 2, r * 0.28);
          ctx.stroke();
          /* layer pips so the strip count survives grayscale */
          for (var k = 0; k < layer; k++) {
            ctx.fillStyle = '#F7FBFF';
            ctx.beginPath();
            ctx.arc(cx - (layer - 1) * 7 + k * 14, cy + r * 0.66, 4.5, 0, Math.PI * 2);
            ctx.fill();
          }
        });
      })(layer);
    }
  }

  /* ------------------------------------------------------------- horde -- */
  function bakeMob(scene, sil, tint) {
    var key = 'hf_m_' + sil;
    tex(scene, key, MOB, MOB, function (ctx, w, h) {
      var cx = w / 2, cy = h / 2;
      var body = tint, dark = A.darken(tint, 0.42), hi = A.lighten(tint, 0.34);
      var i;
      ctx.save();
      ctx.globalAlpha = 0.30; ctx.fillStyle = '#05080E';
      ctx.beginPath(); ctx.ellipse(cx, cy + 34, 30, 9, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      function legs(n, spread, len, wdt) {
        ctx.strokeStyle = hex(dark); ctx.lineWidth = wdt; ctx.lineCap = 'round';
        for (i = 0; i < n; i++) {
          var s = (i % 2 === 0) ? -1 : 1;
          var k = (i / 2) | 0;
          ctx.beginPath();
          ctx.moveTo(cx + s * 10, cy - 8 + k * 12);
          ctx.lineTo(cx + s * (10 + spread), cy + 2 + k * 12);
          ctx.lineTo(cx + s * (10 + spread * 0.7), cy + len + k * 8);
          ctx.stroke();
        }
      }

      if (sil === 'mite') {
        legs(6, 20, 22, 5);
        ctx.fillStyle = hex(body);
        poly(ctx, [[cx, cy + 30], [cx + 22, cy + 4], [cx + 15, cy - 24], [cx - 15, cy - 24], [cx - 22, cy + 4]]);
        ctx.fill();
        ctx.fillStyle = hex(hi);
        poly(ctx, [[cx, cy + 8], [cx + 12, cy - 6], [cx, cy - 20], [cx - 12, cy - 6]]);
        ctx.fill();
      } else if (sil === 'husk') {
        legs(4, 26, 26, 7);
        ctx.fillStyle = hex(body);
        ctx.beginPath();
        ctx.moveTo(cx, cy + 36);
        ctx.quadraticCurveTo(cx + 36, cy + 14, cx + 28, cy - 22);
        ctx.quadraticCurveTo(cx, cy - 40, cx - 28, cy - 22);
        ctx.quadraticCurveTo(cx - 36, cy + 14, cx, cy + 36);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = hex(dark);
        for (i = 0; i < 3; i++) ctx.fillRect(cx - 24 + i * 17, cy - 16, 8, 30);
        ctx.fillStyle = hex(hi);
        ctx.beginPath(); ctx.ellipse(cx, cy - 24, 20, 9, 0, 0, Math.PI * 2); ctx.fill();
      } else if (sil === 'darter') {
        ctx.fillStyle = hex(body);
        poly(ctx, [[cx, cy + 38], [cx + 18, cy - 6], [cx + 8, cy - 30], [cx - 8, cy - 30], [cx - 18, cy - 6]]);
        ctx.fill();
        ctx.strokeStyle = hex(hi); ctx.lineWidth = 5; ctx.lineCap = 'round';
        for (i = -1; i <= 1; i += 2) {
          ctx.beginPath();
          ctx.moveTo(cx + i * 14, cy - 14);
          ctx.lineTo(cx + i * 34, cy - 30);
          ctx.stroke();
        }
        ctx.fillStyle = hex(dark);
        ctx.beginPath(); ctx.ellipse(cx, cy + 12, 7, 14, 0, 0, Math.PI * 2); ctx.fill();
      } else if (sil === 'wader') {
        legs(4, 30, 24, 8);
        ctx.fillStyle = hex(dark);
        rr(ctx, cx - 32, cy - 30, 64, 60, 16); ctx.fill();
        ctx.fillStyle = hex(body);
        rr(ctx, cx - 26, cy - 24, 52, 44, 12); ctx.fill();
        ctx.fillStyle = hex(hi);
        for (i = 0; i < 3; i++) rr(ctx, cx - 22 + i * 16, cy - 18, 11, 30, 5), ctx.fill();
        ctx.fillStyle = hex(A.darken(tint, 0.6));
        ctx.fillRect(cx - 18, cy + 22, 36, 8);
      } else if (sil === 'spitter') {
        legs(4, 22, 20, 5);
        ctx.fillStyle = hex(body);
        ctx.beginPath(); ctx.ellipse(cx, cy - 4, 26, 30, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = hex(A.darken(tint, 0.55));
        ctx.beginPath();
        ctx.moveTo(cx - 14, cy + 18);
        ctx.quadraticCurveTo(cx, cy + 40, cx + 14, cy + 18);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = hex(hi);
        for (i = -1; i <= 1; i++) {
          ctx.beginPath(); ctx.arc(cx + i * 13, cy - 14, 5.5, 0, Math.PI * 2); ctx.fill();
        }
      } else if (sil === 'drone') {
        ctx.fillStyle = hex(A.lighten(tint, 0.15));
        ctx.globalAlpha = 0.75;
        for (i = -1; i <= 1; i += 2) {
          ctx.beginPath();
          ctx.ellipse(cx + i * 30, cy - 12, 22, 10, i * 0.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = hex(body);
        ctx.beginPath(); ctx.ellipse(cx, cy + 2, 18, 30, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = hex(dark);
        for (i = 0; i < 3; i++) ctx.fillRect(cx - 16, cy - 8 + i * 13, 32, 6);
        ctx.fillStyle = hex(hi);
        ctx.beginPath(); ctx.arc(cx, cy - 22, 8, 0, Math.PI * 2); ctx.fill();
      } else {                                   /* boss */
        ctx.fillStyle = hex(dark);
        ctx.beginPath();
        ctx.moveTo(cx, cy + 46);
        ctx.quadraticCurveTo(cx + 48, cy + 16, cx + 40, cy - 26);
        ctx.quadraticCurveTo(cx, cy - 50, cx - 40, cy - 26);
        ctx.quadraticCurveTo(cx - 48, cy + 16, cx, cy + 46);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = hex(body);
        ctx.beginPath();
        ctx.moveTo(cx, cy + 34);
        ctx.quadraticCurveTo(cx + 34, cy + 10, cx + 28, cy - 20);
        ctx.quadraticCurveTo(cx, cy - 38, cx - 28, cy - 20);
        ctx.quadraticCurveTo(cx - 34, cy + 10, cx, cy + 34);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = hex(hi); ctx.lineWidth = 7; ctx.lineCap = 'round';
        for (i = -1; i <= 1; i += 2) {
          ctx.beginPath();
          ctx.moveTo(cx + i * 20, cy - 26);
          ctx.quadraticCurveTo(cx + i * 46, cy - 44, cx + i * 34, cy - 52);
          ctx.stroke();
        }
        ctx.fillStyle = '#141C2B';
        for (i = -1; i <= 1; i += 2) {
          poly(ctx, [[cx + i * 8, cy - 16], [cx + i * 22, cy - 12], [cx + i * 12, cy - 2]]);
          ctx.fill();
        }
        ctx.fillStyle = hex(A.lighten(tint, 0.55));
        for (i = 0; i < 4; i++) {
          ctx.beginPath();
          ctx.arc(cx - 18 + i * 12, cy + 16, 4.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    });
    return key;
  }

  /* ---------------------------------------------------------- particles - */
  function bakeParticles(scene) {
    tex(scene, 'hf_px', 4, 4, function (ctx, w, h) {
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, w, h);
    });
    tex(scene, 'hf_shard', 16, 16, function (ctx, w, h) {
      ctx.fillStyle = '#FFFFFF';
      poly(ctx, [[8, 0], [16, 7], [9, 16], [1, 8]]);
      ctx.fill();
    });
    tex(scene, 'hf_streak', 8, 40, function (ctx, w, h) {
      var g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.45, 'rgba(255,255,255,1)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      rr(ctx, 1, 0, w - 2, h, 3); ctx.fill();
    });
    tex(scene, 'hf_dot', 14, 14, function (ctx, w, h) {
      var g = ctx.createRadialGradient(7, 7, 0, 7, 7, 7);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.6, 'rgba(255,255,255,0.75)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    });
    tex(scene, 'hf_ring', 48, 48, function (ctx, w, h) {
      ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(24, 24, 20, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 0.4; ctx.lineWidth = 9;
      ctx.beginPath(); ctx.arc(24, 24, 20, 0, Math.PI * 2); ctx.stroke();
    });
    tex(scene, 'hf_smoke', 36, 36, function (ctx, w, h) {
      var g = ctx.createRadialGradient(18, 18, 2, 18, 18, 18);
      g.addColorStop(0, 'rgba(255,255,255,0.55)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    });
  }

  /* --------------------------------------------------------------- shots */
  function bakeShots(scene) {
    var kinds = [
      { key: 'shell', c: 0xFFB35C, w: 14, h: 34 },
      { key: 'coil', c: 0x7FD8FF, w: 16, h: 26 },
      { key: 'venom', c: 0xC48AFF, w: 15, h: 28 }
    ];
    kinds.forEach(function (k) {
      tex(scene, 'hf_s_' + k.key, k.w + 8, k.h + 12, function (ctx, w, h) {
        var cx = w / 2;
        ctx.save();
        ctx.globalAlpha = 0.5;
        var g = ctx.createLinearGradient(0, h, 0, 0);
        g.addColorStop(0, 'rgba(255,255,255,0)');
        g.addColorStop(1, hex(k.c));
        ctx.fillStyle = g;
        rr(ctx, cx - k.w * 0.28, h * 0.30, k.w * 0.56, h * 0.66, k.w * 0.28);
        ctx.fill();
        ctx.restore();
        var gr = ctx.createLinearGradient(cx - k.w / 2, 0, cx + k.w / 2, 0);
        gr.addColorStop(0, hex(A.darken(k.c, 0.3)));
        gr.addColorStop(0.4, hex(A.lighten(k.c, 0.5)));
        gr.addColorStop(1, hex(A.darken(k.c, 0.2)));
        ctx.fillStyle = gr;
        if (k.key === 'shell') {
          ctx.beginPath();
          ctx.moveTo(cx, 2);
          ctx.quadraticCurveTo(cx + k.w * 0.5, h * 0.34, cx + k.w * 0.36, h * 0.60);
          ctx.lineTo(cx - k.w * 0.36, h * 0.60);
          ctx.quadraticCurveTo(cx - k.w * 0.5, h * 0.34, cx, 2);
          ctx.closePath(); ctx.fill();
        } else if (k.key === 'coil') {
          poly(ctx, [[cx, 2], [cx + k.w * 0.5, h * 0.32], [cx, h * 0.62], [cx - k.w * 0.5, h * 0.32]]);
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.moveTo(cx, 2);
          ctx.quadraticCurveTo(cx + k.w * 0.52, h * 0.42, cx, h * 0.64);
          ctx.quadraticCurveTo(cx - k.w * 0.52, h * 0.42, cx, 2);
          ctx.closePath(); ctx.fill();
        }
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.fillRect(cx - 1.5, 6, 3, h * 0.24);
      });
    });
  }

  /* ------------------------------------------------------------ selector */
  function bakeSelector(scene) {
    /* Ready: focus ring that breathes */
    tex(scene, 'hf_focus', TILE, TILE, function (ctx, w, h) {
      ctx.strokeStyle = '#F7FBFF'; ctx.lineWidth = 6; ctx.lineJoin = 'round';
      rr(ctx, 8, 8, w - 16, h - 16, 16); ctx.stroke();
      ctx.strokeStyle = 'rgba(247,176,60,0.85)'; ctx.lineWidth = 3;
      rr(ctx, 13, 13, w - 26, h - 26, 12); ctx.stroke();
      ctx.fillStyle = '#F7FBFF';
      var c = [[8, 8], [w - 8, 8], [8, h - 8], [w - 8, h - 8]];
      for (var i = 0; i < 4; i++) {
        ctx.beginPath(); ctx.arc(c[i][0], c[i][1], 5, 0, Math.PI * 2); ctx.fill();
      }
    });
    /* Preview: solid landing ghost */
    tex(scene, 'hf_ghost', TILE, TILE, function (ctx, w, h) {
      ctx.fillStyle = 'rgba(247,251,255,0.20)';
      rr(ctx, 10, 10, w - 20, h - 20, 14); ctx.fill();
      ctx.strokeStyle = 'rgba(247,251,255,0.85)'; ctx.lineWidth = 4;
      ctx.setLineDash([10, 8]);
      rr(ctx, 10, 10, w - 20, h - 20, 14); ctx.stroke();
    });
    /* Preview: direction arrow */
    tex(scene, 'hf_arrow', 56, 56, function (ctx, w, h) {
      ctx.fillStyle = '#F7FBFF';
      poly(ctx, [[28, 6], [50, 30], [37, 30], [37, 50], [19, 50], [19, 30], [6, 30]]);
      ctx.fill();
      ctx.strokeStyle = 'rgba(20,28,43,0.65)'; ctx.lineWidth = 3; ctx.stroke();
    });
    /* Invalid: amber cross hatch */
    tex(scene, 'hf_cross', TILE, TILE, function (ctx, w, h) {
      ctx.save();
      rr(ctx, 8, 8, w - 16, h - 16, 14); ctx.clip();
      ctx.strokeStyle = 'rgba(247,176,60,0.55)'; ctx.lineWidth = 6;
      for (var i = -TILE; i < TILE * 2; i += 16) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + TILE, TILE); ctx.stroke();
      }
      ctx.restore();
      ctx.strokeStyle = '#F7B03C'; ctx.lineWidth = 5;
      rr(ctx, 8, 8, w - 16, h - 16, 14); ctx.stroke();
    });
    /* Resolve: contact flash */
    tex(scene, 'hf_pop', TILE, TILE, function (ctx, w, h) {
      var g = ctx.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(255,255,255,0.95)');
      g.addColorStop(0.55, 'rgba(255,255,255,0.30)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    });
  }

  /* ------------------------------------------------------------- chrome - */
  function bakeChrome(scene) {
    /* HUD/card panels, buttons, chips, bars, telegraph marks */
    tex(scene, 'hf_card', 96, 96, function (ctx, w, h) {
      ctx.fillStyle = 'rgba(20,28,43,0.92)';
      rr(ctx, 3, 3, w - 6, h - 6, 18); ctx.fill();
      ctx.strokeStyle = 'rgba(123,149,180,0.55)'; ctx.lineWidth = 3;
      rr(ctx, 3, 3, w - 6, h - 6, 18); ctx.stroke();
      ctx.strokeStyle = 'rgba(247,251,255,0.16)'; ctx.lineWidth = 2;
      rr(ctx, 7, 7, w - 14, h - 14, 14); ctx.stroke();
    });
    tex(scene, 'hf_chip', 64, 64, function (ctx, w, h) {
      ctx.fillStyle = 'rgba(20,28,43,0.86)';
      rr(ctx, 2, 2, w - 4, h - 4, 16); ctx.fill();
      ctx.strokeStyle = 'rgba(123,149,180,0.5)'; ctx.lineWidth = 2;
      rr(ctx, 2, 2, w - 4, h - 4, 16); ctx.stroke();
    });
    tex(scene, 'hf_btn', 96, 96, function (ctx, w, h) {
      var g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#38506F'); g.addColorStop(1, '#22314A');
      ctx.fillStyle = g;
      rr(ctx, 2, 2, w - 4, h - 4, 18); ctx.fill();
      ctx.strokeStyle = 'rgba(155,180,210,0.55)'; ctx.lineWidth = 3;
      rr(ctx, 2, 2, w - 4, h - 4, 18); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      rr(ctx, 8, 7, w - 16, h * 0.34, 12); ctx.fill();
    });
    tex(scene, 'hf_btn_go', 96, 96, function (ctx, w, h) {
      var g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#FFD98A'); g.addColorStop(1, '#E09A22');
      ctx.fillStyle = g;
      rr(ctx, 2, 2, w - 4, h - 4, 18); ctx.fill();
      ctx.strokeStyle = 'rgba(255,240,200,0.9)'; ctx.lineWidth = 3;
      rr(ctx, 2, 2, w - 4, h - 4, 18); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      rr(ctx, 8, 7, w - 16, h * 0.32, 12); ctx.fill();
    });
    tex(scene, 'hf_btn_dim', 96, 96, function (ctx, w, h) {
      ctx.fillStyle = 'rgba(24,32,46,0.9)';
      rr(ctx, 2, 2, w - 4, h - 4, 18); ctx.fill();
      ctx.strokeStyle = 'rgba(90,110,135,0.42)'; ctx.lineWidth = 2;
      rr(ctx, 2, 2, w - 4, h - 4, 18); ctx.stroke();
    });
    tex(scene, 'hf_bar_bg', 32, 32, function (ctx, w, h) {
      ctx.fillStyle = '#0E1420';
      rr(ctx, 0, 0, w, h, 10); ctx.fill();
      ctx.strokeStyle = 'rgba(123,149,180,0.35)'; ctx.lineWidth = 2;
      rr(ctx, 1, 1, w - 2, h - 2, 10); ctx.stroke();
    });
    tex(scene, 'hf_bar_fill', 32, 32, function (ctx, w, h) {
      var g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, 'rgba(255,255,255,0.55)');
      g.addColorStop(0.5, 'rgba(255,255,255,1)');
      g.addColorStop(1, 'rgba(255,255,255,0.7)');
      ctx.fillStyle = g;
      rr(ctx, 0, 0, w, h, 8); ctx.fill();
    });
    /* telegraph chevron: pending spawn marker at the top of a lane */
    tex(scene, 'hf_chev', 40, 26, function (ctx, w, h) {
      ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(6, 6); ctx.lineTo(20, 19); ctx.lineTo(34, 6);
      ctx.stroke();
    });
    /* lane danger wash: bottom-weighted gradient shown on a threatened lane */
    tex(scene, 'hf_lanewash', 16, 128, function (ctx, w, h) {
      var g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(1, 'rgba(255,255,255,0.85)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    });
    tex(scene, 'hf_vig', 128, 128, function (ctx, w, h) {
      var g = ctx.createRadialGradient(w / 2, h / 2, w * 0.28, w / 2, h / 2, w * 0.62);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.62)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    });
    /* flash quad for hitstop / breach */
    tex(scene, 'hf_flash', 8, 8, function (ctx, w, h) {
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, w, h);
    });
  }

  function bakeIcons(scene) {
    var icons = ['shell', 'flake', 'wall', 'gear', 'eye', 'cross', 'spark', 'vent',
      'brick', 'flame', 'flare', 'chevron', 'drop'];
    icons.forEach(function (k) {
      tex(scene, 'hf_ic_' + k, 64, 64, function (ctx, w, h) {
        glyph(ctx, k, w / 2, h / 2, w * 0.36, '#FFFFFF');
      });
    });
  }

  /* --------------------------------------------------------- act chrome - */
  /* The board frame is an object in the scene: rounded material frame, inner
   * padding, contact shadow and a highlight edge. One bake per act and size. */
  A.frameKey = function (act, w, h) {
    return 'hf_frame_' + act.id + '_' + Math.round(w) + 'x' + Math.round(h);
  };
  A.bakeFrame = function (scene, act, w, h, cell, cols, rows, pad) {
    var key = A.frameKey(act, w, h);
    if (scene.textures.exists(key)) return key;
    tex(scene, key, w, h, function (ctx) {
      /* outer frame */
      var g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, hex(A.lighten(act.frameB, 0.18)));
      g.addColorStop(0.5, hex(act.frameB));
      g.addColorStop(1, hex(act.frameA));
      ctx.fillStyle = g;
      rr(ctx, 0, 0, w, h, 18); ctx.fill();
      ctx.strokeStyle = hex(A.lighten(act.trim, 0.1));
      ctx.lineWidth = 3;
      rr(ctx, 1.5, 1.5, w - 3, h - 3, 17); ctx.stroke();

      /* frame material detail per act */
      ctx.save();
      rr(ctx, 0, 0, w, h, 18); ctx.clip();
      ctx.globalAlpha = 0.30;
      var i;
      if (act.frame === 'fence') {
        ctx.fillStyle = hex(A.darken(act.frameA, 0.35));
        for (i = 0; i < w; i += 13) ctx.fillRect(i, 0, 5, h);
      } else if (act.frame === 'tile') {
        ctx.strokeStyle = hex(A.lighten(act.frameB, 0.4)); ctx.lineWidth = 2;
        for (i = 0; i < w; i += 16) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, h); ctx.stroke(); }
        for (i = 0; i < h; i += 16) { ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(w, i); ctx.stroke(); }
      } else if (act.frame === 'enamel') {
        ctx.fillStyle = hex(A.lighten(act.frameB, 0.35));
        ctx.fillRect(0, 6, w, 4);
        ctx.fillRect(0, h - 10, w, 4);
      } else {
        ctx.fillStyle = hex(A.lighten(act.frameB, 0.35));
        for (var yy = -10; yy < h + 20; yy += 22) {
          for (var xx = -10; xx < w + 20; xx += 26) {
            poly(ctx, hexPts(xx + ((yy / 22) % 2) * 13, yy, 10, Math.PI / 6));
            ctx.fill();
          }
        }
      }
      ctx.restore();

      /* inner well */
      var ix = pad, iy = pad, iw = w - pad * 2, ih = h - pad * 2;
      ctx.fillStyle = hex(HF.PAL.board);
      rr(ctx, ix, iy, iw, ih, 12); ctx.fill();
      ctx.save();
      rr(ctx, ix, iy, iw, ih, 12); ctx.clip();
      /* cell rhythm */
      for (var r = 0; r < rows; r++) {
        for (var c = 0; c < cols; c++) {
          var x = ix + 6 + c * cell, y = iy + 6 + r * cell;
          ctx.fillStyle = hex(((r + c) % 2) ? HF.PAL.cell : HF.PAL.cellAlt);
          rr(ctx, x + 2, y + 2, cell - 4, cell - 4, Math.max(4, cell * 0.14));
          ctx.fill();
          ctx.strokeStyle = 'rgba(89,112,143,0.42)';
          ctx.lineWidth = 1.5;
          rr(ctx, x + 2.5, y + 2.5, cell - 5, cell - 5, Math.max(4, cell * 0.14));
          ctx.stroke();
        }
      }
      /* quiet corner vignette inside the well */
      var vg = ctx.createRadialGradient(ix + iw / 2, iy + ih / 2, iw * 0.30, ix + iw / 2, iy + ih / 2, iw * 0.78);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,0.30)');
      ctx.fillStyle = vg; ctx.fillRect(ix, iy, iw, ih);
      ctx.restore();
      ctx.strokeStyle = 'rgba(9,13,20,0.75)'; ctx.lineWidth = 3;
      rr(ctx, ix, iy, iw, ih, 12); ctx.stroke();
    });
    return key;
  };

  /* Lane track: sky, ground, lane rhythm, spawn line and the wall with its
   * turret nubs. One bake per act and size; nothing here is per frame. */
  A.trackKey = function (act, w, h, cols) {
    return 'hf_track_' + act.id + '_' + Math.round(w) + 'x' + Math.round(h) + '_' + cols;
  };
  A.bakeTrack = function (scene, act, w, h, cols, laneX0, laneW, wallH) {
    var key = A.trackKey(act, w, h, cols);
    if (scene.textures.exists(key)) return key;
    tex(scene, key, w, h, function (ctx) {
      var i;
      vgrad(ctx, 0, 0, w, h, act.skyTop, act.skyBot);
      /* distant silhouette band per act */
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = hex(A.darken(act.skyTop, 0.45));
      if (act.frame === 'fence') {
        for (i = 0; i < 7; i++) {
          var bw = w / 6.2, bx = i * bw - 8, bh = 34 + ((i * 37) % 26);
          ctx.fillRect(bx, h * 0.10, bw - 10, bh);
          poly(ctx, [[bx - 4, h * 0.10], [bx + bw / 2 - 5, h * 0.10 - 18], [bx + bw - 6, h * 0.10]]);
          ctx.fill();
        }
      } else if (act.frame === 'tile') {
        for (i = 0; i < 5; i++) {
          ctx.fillRect(i * (w / 5) + 6, h * 0.08, w / 5 - 14, 46);
          ctx.fillRect(i * (w / 5) + 16, h * 0.08 + 46, w / 5 - 34, 22);
        }
      } else if (act.frame === 'enamel') {
        for (i = 0; i < 8; i++) ctx.fillRect(i * (w / 8) + 4, h * 0.07, w / 8 - 10, 30 + (i % 3) * 12);
        ctx.fillRect(0, h * 0.07 + 54, w, 8);
      } else {
        for (var yy = 0; yy < h * 0.42; yy += 26) {
          for (var xx = -10; xx < w + 20; xx += 30) {
            poly(ctx, hexPts(xx + ((yy / 26) % 2) * 15, yy + 10, 12, Math.PI / 6));
            ctx.fill();
          }
        }
      }
      ctx.restore();

      /* ground plate under the lanes, fading out of the haze */
      var gy0 = h * 0.26;
      var gg = ctx.createLinearGradient(0, gy0, 0, h);
      gg.addColorStop(0, hex(A.mix(act.skyBot, act.ground, 0.35)));
      gg.addColorStop(0.35, hex(act.ground));
      gg.addColorStop(1, hex(A.darken(act.ground, 0.35)));
      ctx.fillStyle = gg;
      ctx.fillRect(0, gy0, w, h - gy0);
      /* horizon glow where the ground meets the act sky */
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = hex(act.trim);
      ctx.fillRect(0, gy0 - 2, w, 2);
      ctx.globalAlpha = 0.16;
      var hg = ctx.createLinearGradient(0, gy0 - 26, 0, gy0 + 10);
      hg.addColorStop(0, 'rgba(255,255,255,0)');
      hg.addColorStop(1, hex(act.trim));
      ctx.fillStyle = hg;
      ctx.fillRect(0, gy0 - 26, w, 36);
      ctx.restore();

      /* lanes: translucent so the act scene reads through the play field */
      ctx.save();
      for (i = 0; i < cols; i++) {
        var x = laneX0 + i * laneW;
        ctx.globalAlpha = (i % 2) ? 0.30 : 0.44;
        ctx.fillStyle = hex(act.lane);
        ctx.fillRect(x, 0, laneW, h - wallH);
      }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(255,255,255,0.10)';
      ctx.lineWidth = 1.5;
      for (i = 0; i <= cols; i++) {
        var lx = laneX0 + i * laneW + 0.5;
        ctx.beginPath(); ctx.moveTo(lx, 0); ctx.lineTo(lx, h - wallH); ctx.stroke();
      }
      ctx.restore();

      /* act ground props: authored scatter so the lane field is never empty */
      ctx.save();
      var pr = HF.rng(4271 + act.id * 913);
      var fieldTop = gy0 + 8, fieldH = (h - wallH) - fieldTop;
      var n, px, py, pw, ph;
      if (act.frame === 'fence') {
        /* driveways, kerbs and bins down the suburb lanes */
        ctx.globalAlpha = 0.20;
        ctx.fillStyle = hex(A.lighten(act.ground, 0.55));
        for (n = 0; n < cols; n++) {
          if (n % 2) continue;
          px = laneX0 + n * laneW;
          ctx.fillRect(px + laneW * 0.18, fieldTop, laneW * 0.64, fieldH * 0.92);
        }
        ctx.globalAlpha = 0.26;
        ctx.fillStyle = hex(A.lighten(act.frameA, 0.35));
        for (n = 0; n < 8; n++) {
          py = fieldTop + (n / 8) * fieldH;
          ctx.fillRect(laneX0 - 6, py, 6, fieldH / 12);
          ctx.fillRect(laneX0 + cols * laneW, py, 6, fieldH / 12);
        }
        ctx.globalAlpha = 0.38;
        for (n = 0; n < 9; n++) {
          px = laneX0 + pr() * cols * laneW; py = fieldTop + pr() * fieldH;
          ctx.fillStyle = hex(A.darken(act.frameA, 0.25));
          rr(ctx, px - 7, py - 11, 14, 18, 3); ctx.fill();
          ctx.fillStyle = hex(A.lighten(act.frameA, 0.2));
          ctx.fillRect(px - 7, py - 13, 14, 4);
        }
      } else if (act.frame === 'tile') {
        /* standing water: broad ripples and sunk tiles */
        ctx.globalAlpha = 0.20;
        ctx.strokeStyle = hex(A.lighten(act.lane, 0.7));
        ctx.lineWidth = 2;
        for (n = 0; n < 16; n++) {
          px = pr() * w; py = fieldTop + pr() * fieldH;
          ctx.beginPath();
          ctx.ellipse(px, py, 16 + pr() * 26, 4 + pr() * 4, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.globalAlpha = 0.16;
        ctx.fillStyle = hex(A.lighten(act.ground, 0.55));
        for (n = 0; n < 22; n++) {
          px = pr() * w; py = fieldTop + pr() * fieldH;
          ctx.fillRect(px, py, 16, 10);
        }
      } else if (act.frame === 'enamel') {
        /* ward floor: tile joints, trolleys and dropped trays */
        ctx.globalAlpha = 0.18;
        ctx.strokeStyle = hex(A.lighten(act.ground, 0.8));
        ctx.lineWidth = 1.5;
        for (n = 0; n < 9; n++) {
          py = fieldTop + (n / 9) * fieldH;
          ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(w, py); ctx.stroke();
        }
        ctx.globalAlpha = 0.34;
        for (n = 0; n < 7; n++) {
          px = laneX0 + pr() * cols * laneW; py = fieldTop + pr() * fieldH;
          ctx.fillStyle = hex(A.lighten(act.ground, 0.45));
          rr(ctx, px - 16, py - 6, 32, 12, 4); ctx.fill();
          ctx.fillStyle = hex(A.darken(act.ground, 0.4));
          ctx.fillRect(px - 13, py + 6, 4, 6);
          ctx.fillRect(px + 9, py + 6, 4, 6);
        }
      } else {
        /* the hive floor: comb cells, wax drips and glowing seams */
        ctx.globalAlpha = 0.24;
        ctx.fillStyle = hex(A.lighten(act.ground, 0.5));
        for (n = 0; n < 26; n++) {
          px = pr() * w; py = fieldTop + pr() * fieldH;
          poly(ctx, hexPts(px, py, 7 + pr() * 7, Math.PI / 6));
          ctx.fill();
        }
        ctx.globalAlpha = 0.30;
        ctx.strokeStyle = hex(act.trim); ctx.lineWidth = 2;
        for (n = 0; n < 8; n++) {
          px = pr() * w; py = fieldTop + pr() * fieldH;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.quadraticCurveTo(px + 6, py + 18, px + 2, py + 34);
          ctx.stroke();
        }
      }
      ctx.restore();

      /* lane ticks so distance to the wall is readable */
      ctx.save();
      ctx.globalAlpha = 0.14; ctx.fillStyle = '#FFFFFF';
      for (var k = 1; k < 5; k++) {
        var ty = (h - wallH) * (k / 5);
        ctx.fillRect(laneX0, ty, cols * laneW, 1.5);
      }
      ctx.restore();

      /* spawn line at the top: the hive edge */
      ctx.fillStyle = hex(A.darken(act.frameA, 0.25));
      ctx.fillRect(0, 0, w, 8);
      ctx.fillStyle = hex(act.trim);
      for (i = 0; i < cols; i++) ctx.fillRect(laneX0 + i * laneW + 4, 0, laneW - 8, 3);

      /* the wall: plated steel, hazard stripe, sandbags and lane turrets */
      var wy = h - wallH;
      ctx.save();
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = '#05080E';
      ctx.fillRect(0, wy - 10, w, 12);
      ctx.restore();
      var g2 = ctx.createLinearGradient(0, wy, 0, h);
      g2.addColorStop(0, hex(HF.PAL.steelHi));
      g2.addColorStop(0.28, hex(HF.PAL.steel));
      g2.addColorStop(1, hex(A.darken(HF.PAL.steel, 0.5)));
      ctx.fillStyle = g2;
      ctx.fillRect(0, wy, w, wallH);
      /* plate joints and rivets */
      ctx.fillStyle = 'rgba(0,0,0,0.34)';
      for (i = 0; i <= cols; i++) ctx.fillRect(laneX0 + i * laneW - 1, wy + 5, 2, wallH - 5);
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      for (i = 0; i < cols; i++) {
        var rx = laneX0 + (i + 0.5) * laneW;
        ctx.beginPath(); ctx.arc(rx - laneW * 0.30, wy + wallH * 0.62, 1.8, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(rx + laneW * 0.30, wy + wallH * 0.62, 1.8, 0, Math.PI * 2); ctx.fill();
      }
      /* hazard stripe along the parapet */
      ctx.save();
      ctx.globalAlpha = 0.55;
      for (var sx = -wallH; sx < w + wallH; sx += 18) {
        ctx.fillStyle = ((sx / 18) | 0) % 2 ? hex(act.trim) : hex(A.darken(HF.PAL.steel, 0.3));
        poly(ctx, [[sx, wy + 3], [sx + 9, wy + 3], [sx + 9 - 6, wy + 9], [sx - 6, wy + 9]]);
        ctx.fill();
      }
      ctx.restore();
      /* turret nubs, one per lane, aimed up the track */
      for (i = 0; i < cols; i++) {
        var cx = laneX0 + (i + 0.5) * laneW;
        ctx.fillStyle = hex(A.darken(HF.PAL.steel, 0.35));
        rr(ctx, cx - 13, wy - 9, 26, 13, 4); ctx.fill();
        ctx.fillStyle = hex(HF.PAL.steelHi);
        rr(ctx, cx - 11, wy - 11, 22, 12, 4); ctx.fill();
        ctx.fillStyle = hex(A.darken(HF.PAL.steel, 0.15));
        ctx.fillRect(cx - 3.5, wy - 22, 7, 12);
        ctx.fillStyle = hex(act.trim);
        rr(ctx, cx - 3, wy - 25, 6, 5, 2); ctx.fill();
        /* sandbags between the turrets */
        ctx.fillStyle = hex(A.mix(act.frameA, HF.PAL.steel, 0.4));
        rr(ctx, cx + laneW * 0.34, wy - 6, 13, 8, 4); ctx.fill();
      }
      ctx.fillStyle = 'rgba(247,251,255,0.32)';
      ctx.fillRect(0, wy, w, 2);
    });
    return key;
  };

  /* menu / results backdrop */
  A.bakeSky = function (scene, key, w, h, act) {
    tex(scene, key, w, h, function (ctx) {
      vgrad(ctx, 0, 0, w, h, act.skyTop, act.skyBot);
      ctx.save();
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = hex(A.darken(act.skyTop, 0.5));
      for (var i = 0; i < 9; i++) {
        var bw = w / 7, bx = i * bw - 20, bh = 60 + ((i * 53) % 90);
        ctx.fillRect(bx, h * 0.52 - bh, bw - 12, bh + 40);
      }
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = hex(act.trim);
      for (var k = 0; k < 26; k++) {
        var x = (k * 97) % w, y = (k * 131) % (h * 0.5);
        poly(ctx, hexPts(x, y, 6 + (k % 3) * 3, Math.PI / 6));
        ctx.fill();
      }
      ctx.restore();
      var vg = ctx.createRadialGradient(w / 2, h * 0.45, w * 0.2, w / 2, h * 0.5, w * 0.95);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,0.55)');
      ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);
    });
    return key;
  };

  /* squad portrait badge for the shelter and menu screens */
  A.bakeBadges = function (scene) {
    HF.SQUAD.forEach(function (sq) {
      tex(scene, 'hf_badge_' + sq.key, 96, 96, function (ctx, w, h) {
        ctx.fillStyle = hex(A.darken(sq.color, 0.62));
        rr(ctx, 3, 3, w - 6, h - 6, 20); ctx.fill();
        ctx.strokeStyle = hex(sq.color); ctx.lineWidth = 4;
        rr(ctx, 3, 3, w - 6, h - 6, 20); ctx.stroke();
        pieceShape(ctx, sq.shape, w / 2, h / 2, w * 0.30);
        var g = ctx.createLinearGradient(0, h * 0.2, 0, h * 0.8);
        g.addColorStop(0, hex(A.lighten(sq.color, 0.3)));
        g.addColorStop(1, hex(A.darken(sq.color, 0.2)));
        ctx.fillStyle = g; ctx.fill();
        glyph(ctx, sq.glyph, w / 2, h / 2, w * 0.16, inkFor(sq.color));
      });
      tex(scene, 'hf_badge_' + sq.key + '_lock', 96, 96, function (ctx, w, h) {
        ctx.fillStyle = 'rgba(24,32,46,0.92)';
        rr(ctx, 3, 3, w - 6, h - 6, 20); ctx.fill();
        ctx.strokeStyle = 'rgba(110,130,155,0.5)'; ctx.lineWidth = 3;
        rr(ctx, 3, 3, w - 6, h - 6, 20); ctx.stroke();
        ctx.strokeStyle = '#8FA4BB'; ctx.lineWidth = 6; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(w / 2, h * 0.44, 13, Math.PI, 0); ctx.stroke();
        ctx.fillStyle = '#8FA4BB';
        rr(ctx, w / 2 - 20, h * 0.44, 40, 30, 7); ctx.fill();
      });
    });
  };

  /* -------------------------------------------------------------- bake -- */
  A.bakeStatic = function (scene) {
    var i;
    for (i = 0; i < HF.SQUAD.length; i++) {
      bakePiece(scene, HF.SQUAD[i], false);
      bakePiece(scene, HF.SQUAD[i], true);
    }
    for (i = 0; i < HF.ACTS.length; i++) bakeHazard(scene, HF.ACTS[i]);
    var sils = ['mite', 'husk', 'darter', 'wader', 'spitter', 'drone', 'boss'];
    for (i = 0; i < sils.length; i++) bakeMob(scene, sils[i], 0xD8C6A6);
    bakeParticles(scene);
    bakeShots(scene);
    bakeSelector(scene);
    bakeChrome(scene);
    bakeIcons(scene);
    A.bakeBadges(scene);
  };

  A.pieceKey = function (t, charged) {
    var sq = HF.SQUAD[HF.clamp(t | 0, 0, HF.SQUAD.length - 1)];
    return 'hf_p_' + sq.key + (charged ? '_chg' : '');
  };
  A.mobKey = function (sil) { return 'hf_m_' + sil; };
  A.hazKey = function (act, layer) {
    var def = act.hazard;
    return 'hf_haz_' + def.key + '_' + HF.clamp(layer | 0, 1, def.layers);
  };

  return A;
})();
