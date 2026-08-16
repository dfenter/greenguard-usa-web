/* Kinetic Burst - texture bakery.
 *
 * Phaser Graphics replays its entire command list every frame, so nothing
 * static is ever left as a Graphics object. Orbs, the board frame and cell
 * field, backdrops, parallax bands, boss silhouettes, fighter badges, cards,
 * bars, rings and every icon are drawn ONCE into canvas textures here and
 * displayed as images afterwards.
 */
var KBArt = (function () {
  'use strict';
  var A = {};

  var ORB = 88;                 /* bake size of one orb; drawn scaled down */
  A.ORB = ORB;

  A.hex = function (n) { return '#' + ('000000' + (n >>> 0).toString(16)).slice(-6); };
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
  A.inkOn = function (c) { return lum(c) > 0.36 ? '#101828' : '#F7FBFF'; };

  function tex(scene, key, w, h, draw) {
    w = Math.max(1, Math.ceil(w)); h = Math.max(1, Math.ceil(h));
    if (scene.textures.exists(key)) return scene.textures.get(key);
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

  function poly(ctx, cx, cy, r, sides, rot) {
    ctx.beginPath();
    for (var i = 0; i < sides; i++) {
      var a = rot + i * Math.PI * 2 / sides;
      var x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }
  A.poly = poly;

  /* ---------------------------------------------------- orb silhouettes */
  function orbShape(ctx, shape, cx, cy, r) {
    if (shape === 'hex') { poly(ctx, cx, cy, r * 1.04, 6, -Math.PI / 2); return; }
    if (shape === 'diamond') { poly(ctx, cx, cy, r * 1.14, 4, -Math.PI / 2); return; }
    if (shape === 'rsquare') { rr(ctx, cx - r * 0.92, cy - r * 0.92, r * 1.84, r * 1.84, r * 0.40); return; }
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.closePath();
  }

  function orbGlyph(ctx, kind, cx, cy, s) {
    var i, a, x, y;
    if (kind === 'spike') {           /* Power: upward chevron stack */
      ctx.beginPath();
      ctx.moveTo(cx, cy - s * 1.0);
      ctx.lineTo(cx + s * 0.86, cy + s * 0.12);
      ctx.lineTo(cx + s * 0.34, cy + s * 0.12);
      ctx.lineTo(cx + s * 0.34, cy + s * 0.96);
      ctx.lineTo(cx - s * 0.34, cy + s * 0.96);
      ctx.lineTo(cx - s * 0.34, cy + s * 0.12);
      ctx.lineTo(cx - s * 0.86, cy + s * 0.12);
      ctx.closePath();
      return;
    }
    if (kind === 'bolt') {            /* Speed: forward bolt */
      ctx.beginPath();
      ctx.moveTo(cx + s * 0.62, cy - s * 1.0);
      ctx.lineTo(cx - s * 0.72, cy + s * 0.16);
      ctx.lineTo(cx - s * 0.06, cy + s * 0.16);
      ctx.lineTo(cx - s * 0.48, cy + s * 1.0);
      ctx.lineTo(cx + s * 0.80, cy - s * 0.20);
      ctx.lineTo(cx + s * 0.12, cy - s * 0.20);
      ctx.closePath();
      return;
    }
    if (kind === 'iris') {            /* Focus: ring with four ticks */
      ctx.beginPath();
      ctx.arc(cx, cy, s * 0.78, 0, Math.PI * 2);
      ctx.arc(cx, cy, s * 0.44, 0, Math.PI * 2, true);
      ctx.closePath();
      for (i = 0; i < 4; i++) {
        a = i * Math.PI / 2 + Math.PI / 4;
        x = cx + Math.cos(a) * s * 1.0; y = cy + Math.sin(a) * s * 1.0;
        ctx.moveTo(x, y);
        ctx.arc(x, y, s * 0.17, 0, Math.PI * 2);
      }
      return;
    }
    /* Heart: mend cross with clipped corners */
    var t = s * 0.34;
    ctx.beginPath();
    ctx.moveTo(cx - t, cy - s);
    ctx.lineTo(cx + t, cy - s);
    ctx.lineTo(cx + t, cy - t);
    ctx.lineTo(cx + s, cy - t);
    ctx.lineTo(cx + s, cy + t);
    ctx.lineTo(cx + t, cy + t);
    ctx.lineTo(cx + t, cy + s);
    ctx.lineTo(cx - t, cy + s);
    ctx.lineTo(cx - t, cy + t);
    ctx.lineTo(cx - s, cy + t);
    ctx.lineTo(cx - s, cy - t);
    ctx.lineTo(cx - t, cy - t);
    ctx.closePath();
  }

  /* One orb face. state: 'idle' | 'lit' (inside the traced path). */
  A.orbKey = function (t, state) { return 'kb_orb_' + t + '_' + state; };
  A.bakeOrb = function (scene, t, state) {
    var key = A.orbKey(t, state);
    if (scene.textures.exists(key)) return key;
    var ki = KB.KI[t];
    var lit = state === 'lit';
    tex(scene, key, ORB, ORB, function (ctx, w, h) {
      var cx = w / 2, cy = h / 2, r = w * 0.40;
      /* contact shadow */
      ctx.fillStyle = 'rgba(6,9,20,0.42)';
      ctx.beginPath();
      ctx.ellipse(cx, cy + r * 0.70, r * 0.86, r * 0.30, 0, 0, Math.PI * 2);
      ctx.fill();
      /* outer bloom for a linked orb */
      if (lit) {
        var bloom = ctx.createRadialGradient(cx, cy, r * 0.5, cx, cy, r * 1.42);
        bloom.addColorStop(0, 'rgba(' + [(ki.edge >> 16) & 255, (ki.edge >> 8) & 255, ki.edge & 255].join(',') + ',0.55)');
        bloom.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = bloom;
        ctx.beginPath(); ctx.arc(cx, cy, r * 1.42, 0, Math.PI * 2); ctx.fill();
      }
      /* body */
      var g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
      g.addColorStop(0, A.hex(A.lighten(ki.face, lit ? 0.42 : 0.26)));
      g.addColorStop(0.55, A.hex(ki.face));
      g.addColorStop(1, A.hex(A.darken(ki.face, lit ? 0.14 : 0.30)));
      orbShape(ctx, ki.shape, cx, cy, r);
      ctx.fillStyle = g;
      ctx.fill();
      /* edge */
      ctx.lineWidth = lit ? 5 : 3.4;
      ctx.strokeStyle = A.hex(lit ? 0xFFFFFF : ki.edge);
      ctx.stroke();
      /* fake-lambert top highlight */
      ctx.save();
      orbShape(ctx, ki.shape, cx, cy, r);
      ctx.clip();
      var hg = ctx.createLinearGradient(0, cy - r, 0, cy + r * 0.2);
      hg.addColorStop(0, 'rgba(255,255,255,0.42)');
      hg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = hg;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 1.2);
      ctx.restore();
      /* luminous orbit line, the title motif */
      ctx.save();
      ctx.globalAlpha = lit ? 0.95 : 0.6;
      ctx.strokeStyle = A.hex(A.lighten(ki.edge, 0.3));
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, r * 0.92, r * 0.34, -0.42, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      /* glyph: triple coding with the shape and the value */
      ctx.save();
      orbGlyph(ctx, ki.glyph, cx, cy, r * 0.50);
      ctx.fillStyle = A.inkOn(ki.face);
      ctx.globalAlpha = 0.94;
      ctx.fill('evenodd');
      ctx.restore();
    });
    return key;
  };

  /* ------------------------------------------------------- board frame */
  /* One texture holds the frame, the inner shadow and every empty cell. */
  A.bakeBoard = function (scene, key, cell, pad, cols, rows, arc) {
    if (scene.textures.exists(key)) return key;
    var w = cols * cell + pad * 2, h = rows * cell + pad * 2;
    tex(scene, key, w, h, function (ctx) {
      /* outer frame material */
      var fg = ctx.createLinearGradient(0, 0, 0, h);
      fg.addColorStop(0, A.hex(A.lighten(arc.frame, 0.22)));
      fg.addColorStop(1, A.hex(A.darken(arc.frame, 0.24)));
      rr(ctx, 1, 1, w - 2, h - 2, 16);
      ctx.fillStyle = fg;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = A.hex(arc.frameEdge);
      ctx.globalAlpha = 0.75;
      ctx.stroke();
      ctx.globalAlpha = 1;
      /* inner well */
      var iw = cols * cell, ih = rows * cell;
      rr(ctx, pad, pad, iw, ih, 10);
      var bg = ctx.createLinearGradient(0, pad, 0, pad + ih);
      bg.addColorStop(0, A.hex(A.darken(arc.cell, 0.42)));
      bg.addColorStop(1, A.hex(A.darken(arc.cell, 0.16)));
      ctx.fillStyle = bg;
      ctx.fill();
      /* cell rhythm */
      for (var r = 0; r < rows; r++) {
        for (var c = 0; c < cols; c++) {
          var x = pad + c * cell, y = pad + r * cell;
          rr(ctx, x + 3, y + 3, cell - 6, cell - 6, 9);
          ctx.fillStyle = A.hex(((r + c) & 1) ? A.lighten(arc.cell, 0.05) : arc.cell);
          ctx.fill();
          ctx.lineWidth = 1;
          ctx.strokeStyle = 'rgba(255,255,255,0.10)';
          ctx.stroke();
        }
      }
      /* corner vignette keeps the eye on the middle of the board */
      var v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.28, w / 2, h / 2, Math.max(w, h) * 0.62);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(0,0,0,0.34)');
      ctx.fillStyle = v;
      rr(ctx, pad, pad, iw, ih, 10);
      ctx.fill();
      /* one pixel highlight edge on the frame */
      rr(ctx, 2.5, 2.5, w - 5, h - 5, 15);
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(255,255,255,0.16)';
      ctx.stroke();
    });
    return key;
  };

  /* --------------------------------------------------------- backdrops */
  A.bakeSky = function (scene, key, w, h, arc) {
    if (scene.textures.exists(key)) return key;
    tex(scene, key, Math.max(2, Math.round(w / 4)), Math.max(2, Math.round(h / 4)), function (ctx, cw, ch) {
      var g = ctx.createLinearGradient(0, 0, 0, ch);
      g.addColorStop(0, A.hex(arc.sky[0]));
      g.addColorStop(1, A.hex(arc.sky[1]));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, cw, ch);
      /* one soft light source per arc */
      var rg = ctx.createRadialGradient(cw * 0.72, ch * 0.18, 2, cw * 0.72, ch * 0.18, ch * 0.55);
      rg.addColorStop(0, 'rgba(255,255,255,0.20)');
      rg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, cw, ch);
    });
    return key;
  };

  /* One parallax band, tileable horizontally. layer 0 = far. */
  A.bakeBand = function (scene, key, w, h, arc, layer) {
    if (scene.textures.exists(key)) return key;
    var rnd = KB.rng(0xBA0D + layer * 977 + arc.name.length * 31);
    tex(scene, key, w, h, function (ctx, cw, ch) {
      ctx.fillStyle = A.hex(arc.band[layer]);
      var kind = arc.silhouette;
      var i, x, bw, bh;
      if (kind === 'towers') {
        for (i = 0, x = 0; x < cw; i++) {
          bw = 18 + rnd() * 46;
          bh = ch * (0.30 + rnd() * 0.62);
          ctx.fillRect(x, ch - bh, bw, bh);
          if (bh > ch * 0.6) {
            ctx.fillRect(x + bw * 0.35, ch - bh - 14, bw * 0.18, 14);
          }
          x += bw + 4 + rnd() * 10;
        }
      } else if (kind === 'rings') {
        for (i = 0, x = 10; x < cw; i++) {
          var rad = ch * (0.22 + rnd() * 0.34);
          ctx.beginPath();
          ctx.arc(x, ch - rad * 0.15, rad, Math.PI, 0);
          ctx.lineTo(x + rad, ch);
          ctx.lineTo(x - rad, ch);
          ctx.closePath();
          ctx.fill();
          x += rad * (1.1 + rnd() * 0.9);
        }
      } else if (kind === 'dunes') {
        ctx.beginPath();
        ctx.moveTo(0, ch);
        for (x = 0; x <= cw; x += 12) {
          var y = ch - ch * (0.30 + 0.24 * Math.sin(x / (60 + layer * 40)) + 0.12 * Math.sin(x / 23));
          ctx.lineTo(x, y);
        }
        ctx.lineTo(cw, ch);
        ctx.closePath();
        ctx.fill();
      } else if (kind === 'stacks') {
        for (i = 0, x = 0; x < cw; i++) {
          bw = 26 + rnd() * 30;
          bh = ch * (0.34 + rnd() * 0.56);
          ctx.fillRect(x, ch - bh, bw, bh);
          ctx.fillRect(x + bw * 0.2, ch - bh - 20 - rnd() * 22, bw * 0.22, 26);
          x += bw + 10 + rnd() * 18;
        }
      } else {
        /* core: concentric fault arcs */
        for (i = 0, x = 0; x < cw; i++) {
          var rr2 = ch * (0.30 + rnd() * 0.5);
          ctx.beginPath();
          ctx.moveTo(x, ch);
          ctx.lineTo(x + rr2 * 0.5, ch - rr2);
          ctx.lineTo(x + rr2, ch);
          ctx.closePath();
          ctx.fill();
          x += rr2 * (0.7 + rnd() * 0.6);
        }
      }
    });
    return key;
  };

  /* --------------------------------------------------- boss silhouette */
  A.bakeBoss = function (scene, key, kind, tint) {
    if (scene.textures.exists(key)) return key;
    tex(scene, key, 128, 128, function (ctx, w, h) {
      var cx = w / 2, cy = h / 2;
      ctx.fillStyle = A.hex(tint);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2.5;
      if (kind === 'warden') {
        rr(ctx, cx - 34, cy - 34, 68, 74, 12); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx - 44, cy - 20); ctx.lineTo(cx - 20, cy - 44);
        ctx.lineTo(cx + 20, cy - 44); ctx.lineTo(cx + 44, cy - 20); ctx.closePath();
        ctx.fill(); ctx.stroke();
      } else if (kind === 'skylord') {
        poly(ctx, cx, cy, 38, 3, -Math.PI / 2); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(cx, cy, 56, 16, -0.35, 0, Math.PI * 2); ctx.stroke();
      } else if (kind === 'digger') {
        ctx.beginPath(); ctx.arc(cx, cy + 6, 36, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
        for (var i = -2; i <= 2; i++) {
          ctx.beginPath();
          ctx.moveTo(cx + i * 16, cy + 6);
          ctx.lineTo(cx + i * 16 + 6, cy + 42);
          ctx.lineTo(cx + i * 16 - 6, cy + 42);
          ctx.closePath(); ctx.fill();
        }
      } else if (kind === 'forgeling') {
        rr(ctx, cx - 30, cy - 40, 60, 80, 8); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.arc(cx, cy - 8, 14, 0, Math.PI * 2); ctx.closePath();
        ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fill();
      } else {
        poly(ctx, cx, cy, 40, 6, 0); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.arc(cx, cy, 18, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fill();
      }
    });
    return key;
  };

  /* ----------------------------------------------------- fighter badge */
  var BADGE_MARK = {
    anvil: function (ctx, cx, cy, s) {
      ctx.beginPath();
      ctx.moveTo(cx - s, cy - s * 0.2); ctx.lineTo(cx + s, cy - s * 0.2);
      ctx.lineTo(cx + s * 0.55, cy + s * 0.55); ctx.lineTo(cx - s * 0.55, cy + s * 0.55);
      ctx.closePath(); ctx.fill();
      ctx.fillRect(cx - s * 0.24, cy - s, s * 0.48, s * 0.5);
    },
    wing: function (ctx, cx, cy, s) {
      ctx.beginPath();
      ctx.moveTo(cx - s, cy + s * 0.5); ctx.quadraticCurveTo(cx, cy - s * 1.1, cx + s, cy + s * 0.5);
      ctx.quadraticCurveTo(cx, cy - s * 0.1, cx - s, cy + s * 0.5);
      ctx.closePath(); ctx.fill();
    },
    iris: function (ctx, cx, cy, s) {
      ctx.beginPath();
      ctx.arc(cx, cy, s * 0.9, 0, Math.PI * 2);
      ctx.arc(cx, cy, s * 0.42, 0, Math.PI * 2, true);
      ctx.fill('evenodd');
    },
    ridge: function (ctx, cx, cy, s) {
      ctx.beginPath();
      ctx.moveTo(cx - s, cy + s * 0.7); ctx.lineTo(cx - s * 0.25, cy - s * 0.8);
      ctx.lineTo(cx + s * 0.25, cy + s * 0.1); ctx.lineTo(cx + s, cy - s * 0.55);
      ctx.lineTo(cx + s, cy + s * 0.7); ctx.closePath(); ctx.fill();
    },
    edge: function (ctx, cx, cy, s) {
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.8, cy + s * 0.9); ctx.lineTo(cx + s * 0.5, cy - s * 0.9);
      ctx.lineTo(cx + s * 0.85, cy - s * 0.45); ctx.lineTo(cx - s * 0.4, cy + s * 0.9);
      ctx.closePath(); ctx.fill();
    },
    rill: function (ctx, cx, cy, s) {
      ctx.lineWidth = s * 0.34; ctx.strokeStyle = ctx.fillStyle;
      for (var i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(cx - s, cy + i * s * 0.62);
        ctx.quadraticCurveTo(cx, cy + i * s * 0.62 - s * 0.6, cx + s, cy + i * s * 0.62);
        ctx.stroke();
      }
    },
    burn: function (ctx, cx, cy, s) {
      ctx.beginPath();
      ctx.moveTo(cx, cy - s);
      ctx.quadraticCurveTo(cx + s * 0.9, cy, cx + s * 0.45, cy + s * 0.8);
      ctx.quadraticCurveTo(cx, cy + s * 0.4, cx - s * 0.45, cy + s * 0.8);
      ctx.quadraticCurveTo(cx - s * 0.9, cy, cx, cy - s);
      ctx.closePath(); ctx.fill();
    },
    arc: function (ctx, cx, cy, s) {
      ctx.lineWidth = s * 0.3; ctx.strokeStyle = ctx.fillStyle;
      ctx.beginPath(); ctx.arc(cx, cy + s * 0.3, s * 0.9, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy + s * 0.3, s * 0.45, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    },
    zero: function (ctx, cx, cy, s) {
      ctx.lineWidth = s * 0.28; ctx.strokeStyle = ctx.fillStyle;
      ctx.beginPath(); ctx.arc(cx, cy, s * 0.82, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - s * 0.7, cy + s * 0.7); ctx.lineTo(cx + s * 0.7, cy - s * 0.7); ctx.stroke();
    }
  };

  A.badgeKey = function (fid) { return 'kb_badge_' + fid; };
  A.bakeBadge = function (scene, fid) {
    var key = A.badgeKey(fid);
    if (scene.textures.exists(key)) return key;
    var f = KB.fighter(fid);
    var ki = KB.KI[f.type];
    tex(scene, key, 96, 96, function (ctx, w, h) {
      var cx = w / 2, cy = h / 2;
      rr(ctx, 6, 6, w - 12, h - 12, 20);
      var g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, A.hex(A.lighten(ki.dark, 0.30)));
      g.addColorStop(1, A.hex(A.darken(ki.dark, 0.30)));
      ctx.fillStyle = g; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = A.hex(ki.face); ctx.stroke();
      /* element ring */
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 2; ctx.strokeStyle = A.hex(ki.edge);
      ctx.beginPath(); ctx.ellipse(cx, cy, 34, 13, -0.4, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = A.hex(A.lighten(ki.face, 0.34));
      (BADGE_MARK[f.badge] || BADGE_MARK.anvil)(ctx, cx, cy, 22);
    });
    return key;
  };

  /* ---------------------------------------------------------- selector
   * The player entity for Gate 1: the trace head. Four authored states.
   */
  A.selKey = function (state) { return 'kb_sel_' + state; };
  A.bakeSelector = function (scene, state) {
    var key = A.selKey(state);
    if (scene.textures.exists(key)) return key;
    var col = state === 'invalid' ? 0xF2884A : (state === 'resolve' ? 0xFFFFFF : (state === 'preview' ? 0xA8F0BB : 0xF7FBFF));
    tex(scene, key, 120, 120, function (ctx, w, h) {
      var cx = w / 2, cy = h / 2;
      ctx.strokeStyle = A.hex(col);
      ctx.lineWidth = state === 'resolve' ? 8 : 5;
      ctx.globalAlpha = 0.95;
      if (state === 'invalid') {
        ctx.beginPath(); ctx.arc(cx, cy, 40, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx - 22, cy - 22); ctx.lineTo(cx + 22, cy + 22);
        ctx.moveTo(cx + 22, cy - 22); ctx.lineTo(cx - 22, cy + 22);
        ctx.stroke();
        return;
      }
      /* focus ring plus four corner brackets. The brackets are L shaped so
       * the ready state can never be mistaken for the invalid cross. */
      ctx.beginPath(); ctx.arc(cx, cy, 38, 0, Math.PI * 2); ctx.stroke();
      var e = 50, arm = 17;
      ctx.lineCap = 'round';
      for (var i = 0; i < 4; i++) {
        var sx = (i === 0 || i === 3) ? -1 : 1;
        var sy = (i < 2) ? -1 : 1;
        ctx.beginPath();
        ctx.moveTo(cx + sx * e, cy + sy * e - sy * arm);
        ctx.lineTo(cx + sx * e, cy + sy * e);
        ctx.lineTo(cx + sx * e - sx * arm, cy + sy * e);
        ctx.stroke();
      }
      if (state === 'resolve') {
        ctx.globalAlpha = 0.5;
        ctx.beginPath(); ctx.arc(cx, cy, 54, 0, Math.PI * 2); ctx.stroke();
      }
    });
    return key;
  };

  /* -------------------------------------------------------------- cards */
  A.bakeCard = function (scene, key, w, h, r, fill, alpha, stroke, strokeAlpha) {
    if (scene.textures.exists(key)) return key;
    tex(scene, key, w, h, function (ctx, cw, ch) {
      ctx.globalAlpha = alpha == null ? 1 : alpha;
      rr(ctx, 1, 1, cw - 2, ch - 2, r);
      var g = ctx.createLinearGradient(0, 0, 0, ch);
      g.addColorStop(0, A.hex(A.lighten(fill, 0.12)));
      g.addColorStop(1, A.hex(A.darken(fill, 0.12)));
      ctx.fillStyle = g;
      ctx.fill();
      if (stroke != null) {
        ctx.globalAlpha = strokeAlpha == null ? 0.6 : strokeAlpha;
        ctx.lineWidth = 2;
        ctx.strokeStyle = A.hex(stroke);
        ctx.stroke();
      }
    });
    return key;
  };

  A.bakeSwatch = function (scene, key, fill) {
    if (scene.textures.exists(key)) return key;
    tex(scene, key, 8, 8, function (ctx, w, h) {
      ctx.fillStyle = A.hex(fill);
      ctx.fillRect(0, 0, w, h);
    });
    return key;
  };

  A.bakeBar = function (scene, key, fill) {
    if (scene.textures.exists(key)) return key;
    tex(scene, key, 64, 12, function (ctx, w, h) {
      rr(ctx, 0, 0, w, h, h / 2);
      ctx.fillStyle = A.hex(fill);
      ctx.fill();
    });
    return key;
  };

  /* ---------------------------------------------------------- particles */
  function bakeParticles(scene) {
    tex(scene, 'kb_shard', 24, 24, function (ctx, w, h) {
      ctx.fillStyle = '#FFFFFF';
      poly(ctx, w / 2, h / 2, 10, 4, 0.3);
      ctx.fill();
    });
    tex(scene, 'kb_dot', 16, 16, function (ctx, w, h) {
      var g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.6, 'rgba(255,255,255,0.85)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    });
    tex(scene, 'kb_streak', 12, 56, function (ctx, w, h) {
      var g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.45, 'rgba(255,255,255,0.95)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      rr(ctx, w * 0.25, 0, w * 0.5, h, w * 0.25);
      ctx.fill();
    });
    /* hand tessellated ring: Graphics.arc walks 0.01 rad steps, a baked
     * texture costs nothing per frame */
    tex(scene, 'kb_ring', 128, 128, function (ctx, w, h) {
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 7;
      ctx.beginPath();
      var cx = w / 2, cy = h / 2, r = 54, seg = 48;
      for (var i = 0; i <= seg; i++) {
        var a = i / seg * Math.PI * 2;
        var x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
    });
    tex(scene, 'kb_spark', 32, 32, function (ctx, w, h) {
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      var cx = w / 2, cy = h / 2;
      for (var i = 0; i < 8; i++) {
        var a = -Math.PI / 2 + i * Math.PI / 4;
        var r = (i % 2 === 0) ? 15 : 4.5;
        var x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
    });
    tex(scene, 'kb_px', 4, 4, function (ctx, w, h) {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, w, h);
    });
  }

  /* -------------------------------------------------------------- icons */
  var ICONS = {
    gear: function (ctx, s) {
      ctx.beginPath();
      for (var i = 0; i < 8; i++) {
        var a = i * Math.PI / 4;
        var r1 = s * 0.95, r2 = s * 0.62;
        ctx.lineTo(Math.cos(a - 0.16) * r2, Math.sin(a - 0.16) * r2);
        ctx.lineTo(Math.cos(a - 0.10) * r1, Math.sin(a - 0.10) * r1);
        ctx.lineTo(Math.cos(a + 0.10) * r1, Math.sin(a + 0.10) * r1);
        ctx.lineTo(Math.cos(a + 0.16) * r2, Math.sin(a + 0.16) * r2);
      }
      ctx.closePath();
      ctx.arc(0, 0, s * 0.30, 0, Math.PI * 2, true);
      ctx.fill('evenodd');
    },
    sound: function (ctx, s) {
      ctx.beginPath();
      ctx.moveTo(-s * 0.9, -s * 0.3); ctx.lineTo(-s * 0.4, -s * 0.3);
      ctx.lineTo(0, -s * 0.8); ctx.lineTo(0, s * 0.8);
      ctx.lineTo(-s * 0.4, s * 0.3); ctx.lineTo(-s * 0.9, s * 0.3);
      ctx.closePath(); ctx.fill();
      ctx.lineWidth = s * 0.18; ctx.strokeStyle = ctx.fillStyle;
      ctx.beginPath(); ctx.arc(s * 0.15, 0, s * 0.42, -0.9, 0.9); ctx.stroke();
      ctx.beginPath(); ctx.arc(s * 0.15, 0, s * 0.74, -0.9, 0.9); ctx.stroke();
    },
    mute: function (ctx, s) {
      ctx.beginPath();
      ctx.moveTo(-s * 0.9, -s * 0.3); ctx.lineTo(-s * 0.4, -s * 0.3);
      ctx.lineTo(0, -s * 0.8); ctx.lineTo(0, s * 0.8);
      ctx.lineTo(-s * 0.4, s * 0.3); ctx.lineTo(-s * 0.9, s * 0.3);
      ctx.closePath(); ctx.fill();
      ctx.lineWidth = s * 0.20; ctx.strokeStyle = ctx.fillStyle;
      ctx.beginPath();
      ctx.moveTo(s * 0.25, -s * 0.4); ctx.lineTo(s * 0.85, s * 0.4);
      ctx.moveTo(s * 0.85, -s * 0.4); ctx.lineTo(s * 0.25, s * 0.4);
      ctx.stroke();
    },
    back: function (ctx, s) {
      ctx.beginPath();
      ctx.moveTo(s * 0.35, -s * 0.85); ctx.lineTo(-s * 0.5, 0); ctx.lineTo(s * 0.35, s * 0.85);
      ctx.lineTo(s * 0.62, s * 0.55); ctx.lineTo(s * 0.05, 0); ctx.lineTo(s * 0.62, -s * 0.55);
      ctx.closePath(); ctx.fill();
    },
    play: function (ctx, s) {
      ctx.beginPath();
      ctx.moveTo(-s * 0.55, -s * 0.85); ctx.lineTo(s * 0.8, 0); ctx.lineTo(-s * 0.55, s * 0.85);
      ctx.closePath(); ctx.fill();
    },
    pause: function (ctx, s) {
      ctx.fillRect(-s * 0.62, -s * 0.8, s * 0.42, s * 1.6);
      ctx.fillRect(s * 0.2, -s * 0.8, s * 0.42, s * 1.6);
    },
    skip: function (ctx, s) {
      ctx.beginPath();
      ctx.moveTo(-s * 0.85, -s * 0.75); ctx.lineTo(s * 0.1, 0); ctx.lineTo(-s * 0.85, s * 0.75);
      ctx.closePath(); ctx.fill();
      ctx.fillRect(s * 0.28, -s * 0.75, s * 0.34, s * 1.5);
    },
    restart: function (ctx, s) {
      ctx.lineWidth = s * 0.28; ctx.strokeStyle = ctx.fillStyle;
      ctx.beginPath(); ctx.arc(0, 0, s * 0.7, 0.6, Math.PI * 1.9); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(s * 0.72, -s * 0.5); ctx.lineTo(s * 0.20, -s * 0.42); ctx.lineTo(s * 0.62, s * 0.02);
      ctx.closePath(); ctx.fill();
    },
    lock: function (ctx, s) {
      rr(ctx, -s * 0.62, -s * 0.14, s * 1.24, s * 0.95, s * 0.2); ctx.fill();
      ctx.lineWidth = s * 0.22; ctx.strokeStyle = ctx.fillStyle;
      ctx.beginPath(); ctx.arc(0, -s * 0.2, s * 0.4, Math.PI, 0); ctx.stroke();
    },
    map: function (ctx, s) {
      ctx.beginPath();
      ctx.moveTo(-s * 0.9, -s * 0.6); ctx.lineTo(-s * 0.3, -s * 0.85); ctx.lineTo(s * 0.3, -s * 0.55);
      ctx.lineTo(s * 0.9, -s * 0.85); ctx.lineTo(s * 0.9, s * 0.6); ctx.lineTo(s * 0.3, s * 0.85);
      ctx.lineTo(-s * 0.3, s * 0.55); ctx.lineTo(-s * 0.9, s * 0.85);
      ctx.closePath(); ctx.fill();
    },
    medal: function (ctx, s) {
      ctx.beginPath(); ctx.arc(0, s * 0.2, s * 0.62, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-s * 0.5, -s * 0.9); ctx.lineTo(-s * 0.1, -s * 0.9); ctx.lineTo(-s * 0.1, -s * 0.2);
      ctx.lineTo(-s * 0.5, -s * 0.2); ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(s * 0.1, -s * 0.9); ctx.lineTo(s * 0.5, -s * 0.9); ctx.lineTo(s * 0.5, -s * 0.2);
      ctx.lineTo(s * 0.1, -s * 0.2); ctx.closePath(); ctx.fill();
    },
    crown: function (ctx, s) {
      ctx.beginPath();
      ctx.moveTo(-s * 0.9, s * 0.55); ctx.lineTo(-s * 0.75, -s * 0.6); ctx.lineTo(-s * 0.3, s * 0.05);
      ctx.lineTo(0, -s * 0.85); ctx.lineTo(s * 0.3, s * 0.05); ctx.lineTo(s * 0.75, -s * 0.6);
      ctx.lineTo(s * 0.9, s * 0.55);
      ctx.closePath(); ctx.fill();
      ctx.fillRect(-s * 0.9, s * 0.6, s * 1.8, s * 0.28);
    },
    star: function (ctx, s) {
      ctx.beginPath();
      for (var i = 0; i < 10; i++) {
        var a = -Math.PI / 2 + i * Math.PI / 5;
        var r = (i % 2 === 0) ? s : s * 0.45;
        var x = Math.cos(a) * r, y = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath(); ctx.fill();
    },
    target: function (ctx, s) {
      ctx.lineWidth = s * 0.2; ctx.strokeStyle = ctx.fillStyle;
      ctx.beginPath(); ctx.arc(0, 0, s * 0.75, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, s * 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-s, 0); ctx.lineTo(-s * 0.5, 0);
      ctx.moveTo(s * 0.5, 0); ctx.lineTo(s, 0);
      ctx.moveTo(0, -s); ctx.lineTo(0, -s * 0.5);
      ctx.moveTo(0, s * 0.5); ctx.lineTo(0, s);
      ctx.stroke();
    },
    burst: function (ctx, s) {
      ctx.beginPath();
      for (var i = 0; i < 12; i++) {
        var a = -Math.PI / 2 + i * Math.PI / 6;
        var r = (i % 2 === 0) ? s : s * 0.42;
        var x = Math.cos(a) * r, y = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath(); ctx.fill();
    },
    heart: function (ctx, s) {
      var t = s * 0.34;
      ctx.beginPath();
      ctx.moveTo(-t, -s); ctx.lineTo(t, -s); ctx.lineTo(t, -t); ctx.lineTo(s, -t);
      ctx.lineTo(s, t); ctx.lineTo(t, t); ctx.lineTo(t, s); ctx.lineTo(-t, s);
      ctx.lineTo(-t, t); ctx.lineTo(-s, t); ctx.lineTo(-s, -t); ctx.lineTo(-t, -t);
      ctx.closePath(); ctx.fill();
    },
    shield: function (ctx, s) {
      ctx.beginPath();
      ctx.moveTo(0, -s); ctx.lineTo(s * 0.8, -s * 0.6); ctx.lineTo(s * 0.8, s * 0.2);
      ctx.quadraticCurveTo(s * 0.7, s * 0.85, 0, s);
      ctx.quadraticCurveTo(-s * 0.7, s * 0.85, -s * 0.8, s * 0.2);
      ctx.lineTo(-s * 0.8, -s * 0.6);
      ctx.closePath(); ctx.fill();
    },
    clock: function (ctx, s) {
      ctx.lineWidth = s * 0.2; ctx.strokeStyle = ctx.fillStyle;
      ctx.beginPath(); ctx.arc(0, 0, s * 0.82, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(0, -s * 0.5);
      ctx.moveTo(0, 0); ctx.lineTo(s * 0.42, s * 0.12);
      ctx.stroke();
    },
    roster: function (ctx, s) {
      ctx.beginPath(); ctx.arc(-s * 0.42, -s * 0.3, s * 0.34, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(s * 0.42, -s * 0.3, s * 0.34, 0, Math.PI * 2); ctx.fill();
      rr(ctx, -s * 0.9, s * 0.12, s * 0.85, s * 0.72, s * 0.2); ctx.fill();
      rr(ctx, s * 0.05, s * 0.12, s * 0.85, s * 0.72, s * 0.2); ctx.fill();
    },
    infinity: function (ctx, s) {
      ctx.lineWidth = s * 0.26; ctx.strokeStyle = ctx.fillStyle;
      ctx.beginPath(); ctx.arc(-s * 0.42, 0, s * 0.42, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(s * 0.42, 0, s * 0.42, 0, Math.PI * 2); ctx.stroke();
    },
    info: function (ctx, s) {
      ctx.beginPath(); ctx.arc(0, -s * 0.58, s * 0.19, 0, Math.PI * 2); ctx.fill();
      rr(ctx, -s * 0.18, -s * 0.20, s * 0.36, s * 1.05, s * 0.14); ctx.fill();
    },
    chevron: function (ctx, s) {
      ctx.lineWidth = s * 0.3; ctx.strokeStyle = ctx.fillStyle;
      ctx.beginPath();
      ctx.moveTo(-s * 0.45, -s * 0.6); ctx.lineTo(s * 0.35, 0); ctx.lineTo(-s * 0.45, s * 0.6);
      ctx.stroke();
    },
    trial: function (ctx, s) {
      ctx.beginPath();
      ctx.moveTo(0, -s); ctx.lineTo(s * 0.9, -s * 0.2); ctx.lineTo(s * 0.55, s * 0.9);
      ctx.lineTo(-s * 0.55, s * 0.9); ctx.lineTo(-s * 0.9, -s * 0.2);
      ctx.closePath(); ctx.fill();
    }
  };

  A.ICON_NAMES = Object.keys(ICONS);
  A.bakeIcons = function (scene) {
    A.ICON_NAMES.forEach(function (name) {
      var key = 'kb_ic_' + name;
      if (scene.textures.exists(key)) return;
      tex(scene, key, 48, 48, function (ctx, w, h) {
        ctx.save();
        ctx.translate(w / 2, h / 2);
        ctx.fillStyle = '#FFFFFF';
        ICONS[name](ctx, 18);
        ctx.restore();
      });
    });
  };

  /* --------------------------------------------------------- bake sets */
  A.bakeStatic = function (scene) {
    for (var t = 0; t < KB.ORB_TYPES; t++) {
      A.bakeOrb(scene, t, 'idle');
      A.bakeOrb(scene, t, 'lit');
    }
    ['ready', 'preview', 'resolve', 'invalid'].forEach(function (s) { A.bakeSelector(scene, s); });
    for (var f = 0; f < KB.FIGHTER_COUNT; f++) A.bakeBadge(scene, f);
    bakeParticles(scene);
    A.bakeIcons(scene);
    A.bakeSwatch(scene, 'kb_ink', 0x141B2E);
    A.bakeSwatch(scene, 'kb_white', 0xFFFFFF);
    A.bakeBar(scene, 'kb_bar_bg', 0x0C1428);
    A.bakeBar(scene, 'kb_bar_fg', 0xFFFFFF);
    for (var a = 0; a < KB.ARC_COUNT; a++) {
      A.bakeBoss(scene, 'kb_boss_' + a, KB.arc(a).boss, KB.arc(a).accent);
    }
  };

  return A;
})();
