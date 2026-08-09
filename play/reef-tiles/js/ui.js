/* Reef Tiles - layout, HUD, map / shop / tank screens */
(function () {
  'use strict';
  var G = window.G, T = G.tank, B = G.board;

  G.LAY = { play: { x: 0, y: 52, w: 390, h: 580 }, hud: 52, nav: 62 };

  G.onResize = function () {
    var hud = 52, nav = 62;
    G.LAY.hud = hud; G.LAY.nav = nav;
    G.LAY.play = { x: 0, y: hud, w: G.W, h: Math.max(120, G.H - hud - nav) };
    if (B.geo || B.cfg) B.layout();
    T.rectCalc();
  };

  /* ---------- HUD ---------- */
  G.drawHUD = function () {
    var c = G.ctx, W = G.W;
    c.fillStyle = '#062634';
    c.fillRect(0, 0, W, G.LAY.hud);
    c.fillStyle = '#0a3a4e';
    c.fillRect(0, G.LAY.hud - 2, W, 2);
    G.text('REEF TILES', 12, 18, 15, '#5fd6f5');
    var st = T.stats();
    // pearls
    c.fillStyle = '#fff8e0';
    c.beginPath(); c.arc(20, 36, 7, 0, 6.283); c.fill();
    c.fillStyle = 'rgba(120,170,200,0.5)';
    c.beginPath(); c.arc(18, 34, 2.6, 0, 6.283); c.fill();
    G.text(G.state.pearls + '', 32, 36, 17, '#ffe9a8');
    // comfort meter
    var bx = W - 148, bw = 136;
    G.text('TANK COMFORT ' + st.comfort, bx + bw, 15, 11, '#8fd7f0', 'right');
    c.fillStyle = '#03222f'; G.rr(bx, 24, bw, 14, 7); c.fill();
    var g = c.createLinearGradient(bx, 0, bx + bw, 0);
    g.addColorStop(0, '#2ea9cc'); g.addColorStop(1, '#7effc0');
    c.fillStyle = g; G.rr(bx, 24, Math.max(6, bw * st.comfort / 100), 14, 7); c.fill();
    c.strokeStyle = '#1d6a86'; c.lineWidth = 1.5; G.rr(bx, 24, bw, 14, 7); c.stroke();
    [30, 60].forEach(function (v) {
      c.fillStyle = 'rgba(255,224,138,0.9)';
      c.fillRect(bx + bw * v / 100 - 1, 22, 2, 18);
    });
  };

  /* ---------- bottom nav ---------- */
  var TABS = [['PLAY', 'map'], ['TANK', 'tank'], ['SHOP', 'shop']];
  G.drawNav = function () {
    var c = G.ctx, W = G.W, navY = G.H - G.LAY.nav;
    c.fillStyle = '#062634'; c.fillRect(0, navY, W, G.LAY.nav);
    c.fillStyle = '#0a3a4e'; c.fillRect(0, navY, W, 2);
    var pad = 8, bw = (W - pad * 4) / 3;
    for (var i = 0; i < 3; i++) {
      var t = TABS[i];
      var active = (G.screen === t[1]) || (G.screen === 'level' && t[1] === 'map');
      (function (dest) {
        G.ui.btn(pad + i * (bw + pad), navY + 6, bw, G.LAY.nav - 14, t[0], function () { G.go(dest); },
          { bg: active ? '#1f7fa0' : '#0d3d4f', border: active ? '#6fe0ff' : '#18566d', fs: 15 });
      })(t[1]);
    }
  };

  /* ---------- map screen ---------- */
  G.levelUnlocked = function (i) {
    if (i > 0 && !(G.state.stars[i - 1] > 0)) return false;
    var need = G.BAND_COMFORT[G.bandOf(i)];
    return T.stats().comfort >= need;
  };

  G.screens = {};
  G.screens.map = {
    draw: function () {
      var c = G.ctx, pa = G.LAY.play, st = T.stats();
      c.fillStyle = '#08313f'; c.fillRect(pa.x, pa.y, pa.w, pa.h);
      // ambient bubbles
      c.globalAlpha = 0.12; c.strokeStyle = '#bff0ff'; c.lineWidth = 1.4;
      for (var i = 0; i < 12; i++) {
        var bx = pa.x + ((i * 97) % pa.w), by = pa.y + pa.h - ((T.t * (20 + i * 4) + i * 71) % (pa.h + 40));
        c.beginPath(); c.arc(bx, by, 2 + (i % 4), 0, 6.283); c.stroke();
      }
      c.globalAlpha = 1;
      G.text('REEF EXPEDITIONS', pa.x + pa.w / 2, pa.y + 22, 17, '#bfeeff', 'center');
      var cols = 3, gap = 10;
      var nw = Math.floor((pa.w - gap * (cols + 1)) / cols);
      var top = pa.y + 42;
      var nh = Math.min(84, Math.floor((pa.h - 84 - gap * 6) / 5));
      for (var l = 0; l < G.LEVELS; l++) {
        var r = (l / cols) | 0, cc = l % cols;
        var x = pa.x + gap + cc * (nw + gap), y = top + r * (nh + gap);
        var open = G.levelUnlocked(l);
        var done = G.state.stars[l] > 0;
        (function (li, X, Y, ok) {
          G.ui.btn(X, Y, nw, nh, null, ok ? function () { G.startLevel(li); } : function () {
            G.toast('Comfort ' + G.BAND_COMFORT[G.bandOf(li)] + '+ and clear level ' + li + ' first');
          }, {
            disabled: false,
            bg: ok ? (done ? '#12586f' : '#15718e') : '#0c2c39',
            border: ok ? '#2ea9cc' : '#1a3f4e', r: 12
          });
        })(l, x, y, open);
        G.text((l + 1) + '', x + nw / 2, y + nh * 0.36, 22, open ? '#fff' : '#48707f', 'center');
        if (open) {
          for (var s = 0; s < 3; s++) {
            var on = G.state.stars[l] > s;
            c.fillStyle = on ? '#ffd75e' : 'rgba(255,255,255,0.16)';
            c.beginPath(); c.arc(x + nw / 2 + (s - 1) * 15, y + nh * 0.72, 5.5, 0, 6.283); c.fill();
          }
        } else {
          c.fillStyle = '#48707f';
          G.rr(x + nw / 2 - 8, y + nh * 0.62, 16, 13, 3); c.fill();
          c.beginPath(); c.arc(x + nw / 2, y + nh * 0.62, 6, Math.PI, 0); c.lineWidth = 3; c.strokeStyle = '#48707f'; c.stroke();
        }
      }
      var msg;
      var band = 1;
      if (st.comfort < 30) msg = 'Comfort 30 unlocks levels 6-10 — add plants, hides & feed your fish';
      else if (st.comfort < 60) msg = 'Comfort 60 unlocks levels 11-15 — keep growing the reef';
      else msg = 'Reef is thriving — every expedition is open';
      G.text(msg, pa.x + pa.w / 2, pa.y + pa.h - 16, 12, '#78b6cd', 'center', '600');
    },
    key: function (k) { return false; }
  };

  /* ---------- shop screen ---------- */
  var shop = { tab: 0, page: 0 };
  G.shop = shop;
  G.screens.shop = {
    draw: function () {
      var c = G.ctx, pa = G.LAY.play;
      c.fillStyle = '#08313f'; c.fillRect(pa.x, pa.y, pa.w, pa.h);
      var tw = (pa.w - 24) / 2;
      ['DECOR', 'FISH'].forEach(function (t, i) {
        G.ui.btn(8 + i * (tw + 8), pa.y + 8, tw, 48, t, function () { shop.tab = i; shop.page = 0; },
          { bg: shop.tab === i ? '#1f7fa0' : '#0d3d4f', border: shop.tab === i ? '#6fe0ff' : '#18566d', fs: 15 });
      });
      var items = [];
      if (shop.tab === 0) {
        for (var d = 0; d < G.DECOR.length; d++) for (var v = 0; v < 2; v++) items.push({ kind: 'd', k: d, v: v });
      } else {
        for (var f = 0; f < G.FISH.length; f++) items.push({ kind: 'f', k: f });
      }
      var perPage = 8;
      var pages = Math.max(1, Math.ceil(items.length / perPage));
      if (shop.page >= pages) shop.page = 0;
      var top = pa.y + 56, bot = pa.y + pa.h - (pages > 1 ? 46 : 20);
      var cw = (pa.w - 24) / 2, ch = Math.min(112, (bot - top - 24) / 4);
      var start = shop.page * perPage;
      for (var i2 = 0; i2 < perPage; i2++) {
        var it = items[start + i2];
        if (!it) break;
        var col = i2 % 2, row = (i2 / 2) | 0;
        var x = 8 + col * (cw + 8), y = top + row * (ch + 8);
        drawCard(it, x, y, cw, ch);
      }
      if (pages > 1) {
        G.ui.btn(8, pa.y + pa.h - 48, 90, 48, '◀ PREV', function () { shop.page = (shop.page + pages - 1) % pages; });
        G.ui.btn(pa.w - 98, pa.y + pa.h - 48, 90, 48, 'NEXT ▶', function () { shop.page = (shop.page + 1) % pages; });
        G.text('Page ' + (shop.page + 1) + '/' + pages, pa.w / 2, pa.y + pa.h - 25, 13, '#78b6cd', 'center');
      } else {
        G.text('Everything here is earned with pearls — nothing costs money', pa.w / 2, pa.y + pa.h - 12, 12, '#78b6cd', 'center', '600');
      }
    }
  };

  function ownedCount(it) {
    var n = 0, i;
    if (it.kind === 'd') {
      for (i = 0; i < T.decor.length; i++) if (T.decor[i].k === it.k && T.decor[i].v === it.v) n++;
    } else {
      for (i = 0; i < T.fish.length; i++) if (T.fish[i].s === it.k) n++;
    }
    return n;
  }

  function drawCard(it, x, y, w, h) {
    var c = G.ctx;
    var def = it.kind === 'd' ? G.DECOR[it.k] : G.FISH[it.k];
    var cost = it.kind === 'd' ? def.cost[it.v] : def.cost;
    var name = def.n;
    var afford = G.state.pearls >= cost;
    var full = it.kind === 'd' ? T.decor.length >= 24 : T.fish.length >= 24;
    G.ui.btn(x, y, w, h, null, function () { buy(it); }, {
      bg: afford && !full ? '#0f4a5f' : '#0c2c39',
      border: afford && !full ? '#2ea9cc' : '#1a3f4e', r: 12
    });
    c.save();
    G.rr(x + 1, y + 1, w - 2, h - 2, 11); c.clip();
    // preview
    var px = x + w * 0.28, py = y + h * 0.62;
    if (it.kind === 'd') {
      var sc = Math.min(0.55, (h * 0.5) / Math.max(40, def.h[it.v]));
      T.drawDecorAt(it.k, it.v, px, py, sc, false, 0.5);
    } else {
      T.drawFishAt(it.k, px, y + h * 0.42, Math.min(1.5, (w * 0.26) / def.sz));
    }
    c.restore();
    var tx = x + w * 0.44;
    G.text(name, tx, y + 15, 11.5, '#eaf6ff');
    var sub;
    if (it.kind === 'f') sub = def.desc;
    else {
      var tags = [def.v[it.v]];
      if (def.plant) tags.push('plant ' + def.plant);
      if (def.hide) tags.push('hide ' + def.hide);
      if (def.filt) tags.push('vent ' + def.filt);
      sub = tags.join(' ');
    }
    G.text(sub, tx, y + 30, 9.5, '#7fc4dc', 'left', '600');
    var own = ownedCount(it);
    if (own) G.text('x' + own, x + 8, y + h - 14, 12, '#7effc0');
    c.fillStyle = afford ? '#fff8e0' : '#5b7f8e';
    c.beginPath(); c.arc(tx + 6, y + h - 16, 6, 0, 6.283); c.fill();
    G.text(cost + '', tx + 17, y + h - 15, 15, afford ? '#ffe9a8' : '#5b7f8e');
    G.text(afford ? 'BUY' : 'NEED', x + w - 8, y + h - 15, 13, afford ? '#7effc0' : '#5b7f8e', 'right');
  }

  function buy(it) {
    var def = it.kind === 'd' ? G.DECOR[it.k] : G.FISH[it.k];
    var cost = it.kind === 'd' ? def.cost[it.v] : def.cost;
    if (G.state.pearls < cost) { G.toast('Not enough pearls — clear a level'); G.audio.sfx('bad'); return; }
    var ok = it.kind === 'd' ? T.addDecor(it.k, it.v) : T.addFish(it.k);
    if (!ok) { G.toast('Tank is full'); G.audio.sfx('bad'); return; }
    G.state.pearls -= cost;
    G.audio.sfx('buy');
    G.toast((it.kind === 'd' ? def.n + ' ' + def.v[it.v] : def.n) + ' added to the tank');
    G.saveGame();
  }

  /* ---------- tank screen ---------- */
  var cursor = { x: 0.5, y: 0.5, grab: null };
  G.screens.tank = {
    draw: function () {
      var c = G.ctx, pa = G.LAY.play, r = T.rect;
      c.fillStyle = '#08313f'; c.fillRect(pa.x, pa.y, pa.w, pa.h);
      var st = T.stats();
      G.text('Plants ' + st.plants + '   Hides ' + st.hides + '   Vents ' + st.filters + '   Fish ' + T.fish.length,
        pa.x + 10, pa.y + 24, 13, '#8fd7f0');
      var fedPct = Math.round(T.fed * 100);
      G.text('Fed ' + fedPct + '%', pa.x + pa.w - 10, pa.y + 24, 13, fedPct < 30 ? '#ff9a7a' : '#7effc0', 'right');
      T.draw();
      if (G.keyMode) {
        var cx = r.x + cursor.x * r.w, cy = r.y + cursor.y * r.h;
        c.strokeStyle = '#ffe08a'; c.lineWidth = 2;
        c.beginPath(); c.arc(cx, cy, 12, 0, 6.283); c.stroke();
        c.beginPath(); c.moveTo(cx - 18, cy); c.lineTo(cx + 18, cy); c.moveTo(cx, cy - 18); c.lineTo(cx, cy + 18); c.stroke();
      }
      G.text(G.keyMode ? 'Arrows move cursor — Space feeds — G grabs/drops decor'
        : 'Tap the water to drop food — drag decor to rearrange',
        pa.x + pa.w / 2, pa.y + pa.h - 14, 12, '#78b6cd', 'center', '600');
    },
    down: T.down, move: T.move, up: T.up, cancel: T.cancel,
    key: function (k) {
      var r = T.rect, step = 0.045;
      if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown') {
        cursor.x = G.clamp(cursor.x + (k === 'ArrowRight' ? step : k === 'ArrowLeft' ? -step : 0), 0.03, 0.97);
        cursor.y = G.clamp(cursor.y + (k === 'ArrowDown' ? step : k === 'ArrowUp' ? -step : 0), 0.03, 0.97);
        if (cursor.grab) {
          cursor.grab.x = G.clamp(cursor.x, 0.06, 0.94);
          cursor.grab.y = G.clamp(cursor.y, 0.42, 0.97);
        }
        return true;
      }
      if (k === ' ') { T.dropFood(r.x + cursor.x * r.w, r.y + cursor.y * r.h); return true; }
      if (k === 'g' || k === 'G') {
        if (cursor.grab) { cursor.grab = null; T.drag = null; G.saveGame(); }
        else {
          var best = null, bd = 1e9;
          for (var i = 0; i < T.decor.length; i++) {
            var d = G.dist(cursor.x, cursor.y, T.decor[i].x, T.decor[i].y);
            if (d < bd) { bd = d; best = T.decor[i]; }
          }
          if (best && bd < 0.3) { cursor.grab = best; T.drag = best; G.audio.sfx('tap'); }
        }
        return true;
      }
      return false;
    },
    leave: function () { cursor.grab = null; T.drag = null; }
  };

  /* ---------- level screen ---------- */
  G.screens.level = {
    draw: function () {
      var c = G.ctx, pa = G.LAY.play;
      c.fillStyle = '#08313f'; c.fillRect(pa.x, pa.y, pa.w, pa.h);
      B.draw();
      if (B.over) drawEnd(B.over > 0);
    },
    down: function (rec) { if (!B.over) B.down(rec); },
    move: function (rec) { if (!B.over) B.move(rec); },
    up: function (rec) { if (!B.over) B.up(rec); },
    cancel: function (rec) { B.cancel(rec); },
    key: function (k) { return B.over ? false : B.key(k); },
    leave: function () { B.resetInput(); }
  };

  function drawEnd(win) {
    var c = G.ctx, pa = G.LAY.play;
    c.fillStyle = 'rgba(3,20,30,0.82)';
    c.fillRect(pa.x, pa.y, pa.w, pa.h);
    var w = Math.min(320, pa.w - 30), x = pa.x + (pa.w - w) / 2, h = 250, y = pa.y + (pa.h - h) / 2;
    c.fillStyle = '#0b3d51'; G.rr(x, y, w, h, 16); c.fill();
    c.strokeStyle = win ? '#7effc0' : '#ff8a7a'; c.lineWidth = 3; G.rr(x, y, w, h, 16); c.stroke();
    G.text(win ? 'REEF CLEARED' : 'OUT OF MOVES', x + w / 2, y + 30, 20, win ? '#7effc0' : '#ff8a7a', 'center');
    G.text('Score ' + B.score, x + w / 2, y + 58, 16, '#eaf6ff', 'center');
    if (win) {
      for (var s = 0; s < 3; s++) {
        var on = B.starsWon > s;
        c.fillStyle = on ? '#ffd75e' : 'rgba(255,255,255,0.15)';
        c.beginPath();
        for (var i = 0; i < 10; i++) {
          var a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? 6 : 14;
          c[i ? 'lineTo' : 'moveTo'](x + w / 2 + (s - 1) * 42 + Math.cos(a) * rr, y + 96 + Math.sin(a) * rr);
        }
        c.closePath(); c.fill();
      }
      c.fillStyle = '#fff8e0';
      c.beginPath(); c.arc(x + w / 2 - 26, y + 130, 8, 0, 6.283); c.fill();
      G.text('+' + B.pearlsWon + ' pearls', x + w / 2 - 12, y + 130, 16, '#ffe9a8');
    } else {
      G.text('Goals left: ' + B.cfg.goals.filter(function (g) { return g.got < g.need; }).length,
        x + w / 2, y + 92, 14, '#bfeeff', 'center');
      G.text('Instant retry — no waiting, ever', x + w / 2, y + 118, 12, '#78b6cd', 'center', '600');
    }
    var by = y + h - 108;
    G.ui.btn(x + 16, by, w - 32, 48, 'RETRY', function () { G.startLevel(B.cfg.idx); });
    var nxt = B.cfg.idx + 1;
    if (win && nxt < G.LEVELS) {
      var can = G.levelUnlocked(nxt);
      G.ui.btn(x + 16, by + 52, (w - 40) / 2, 48, 'NEXT', function () {
        if (can) G.startLevel(nxt); else { G.toast('Raise tank comfort to ' + G.BAND_COMFORT[G.bandOf(nxt)]); G.go('tank'); }
      }, { bg: can ? '#12586f' : '#123241', border: can ? '#2ea9cc' : '#1d4557' });
      G.ui.btn(x + 24 + (w - 40) / 2, by + 52, (w - 40) / 2, 48, 'TANK', function () { G.go('tank'); });
    } else {
      G.ui.btn(x + 16, by + 52, (w - 40) / 2, 48, 'MAP', function () { G.go('map'); });
      G.ui.btn(x + 24 + (w - 40) / 2, by + 52, (w - 40) / 2, 48, 'TANK', function () { G.go('tank'); });
    }
  }
})();
