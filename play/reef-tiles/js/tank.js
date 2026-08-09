/* Reef Tiles - living aquarium: decor, fish AI, food, shop */
(function () {
  'use strict';
  var G = window.G;

  /* ---- catalog: 8 decor pieces x 2 variants ---- */
  var DECOR = G.DECOR = [
    { k: 'kelp', n: 'Ribbon Kelp', v: ['Tall', 'Short'], cost: [14, 12], plant: 2, hide: 0, filt: 0, col: ['#3fbf6a', '#57d68a'], h: [110, 70] },
    { k: 'fan', n: 'Fan Coral', v: ['Broad', 'Spire'], cost: [22, 24], plant: 1, hide: 1, filt: 0, col: ['#ff7f9e', '#ffa46b'], h: [80, 105] },
    { k: 'arch', n: 'Stone Arch', v: ['Low', 'High'], cost: [26, 30], plant: 0, hide: 2, filt: 0, col: ['#8d9aa6', '#6e7d8c'], h: [64, 92] },
    { k: 'log', n: 'Hollow Log', v: ['Dark', 'Pale'], cost: [24, 24], plant: 0, hide: 2, filt: 0, col: ['#7a5638', '#b08d64'], h: [52, 52] },
    { k: 'vent', n: 'Filter Vent', v: ['Small', 'Wide'], cost: [30, 42], plant: 0, hide: 0, filt: 1, col: ['#9fd4e6', '#c7e9f5'], h: [56, 74] },
    { k: 'anem', n: 'Glow Anemone', v: ['Violet', 'Amber'], cost: [28, 28], plant: 2, hide: 1, filt: 0, col: ['#b98cff', '#ffc86b'], h: [58, 58] },
    { k: 'shell', n: 'Shell Cluster', v: ['Spiral', 'Scallop'], cost: [16, 16], plant: 0, hide: 1, filt: 0, col: ['#f3dfc8', '#e8c3d8'], h: [40, 36] },
    { k: 'ridge', n: 'Sand Ridge', v: ['Dune', 'Terrace'], cost: [12, 14], plant: 1, hide: 1, filt: 0, col: ['#d9c08a', '#c9b077'], h: [34, 40] }
  ];

  /* ---- 6 original fish species ---- */
  var FISH = G.FISH = [
    { n: 'Glimmerfin', cost: 26, sz: 9, spd: 66, school: 1.0, shy: 0.1, bottom: 0, vent: 0, greed: 0.9, col: '#6fe0ff', fin: '#2f9fd0', desc: 'Tight schools' },
    { n: 'Ember Darter', cost: 34, sz: 12, spd: 84, school: 0.25, shy: 0.05, bottom: 0, vent: 0, greed: 1.6, col: '#ff8a4a', fin: '#c74e1c', desc: 'Chases food hard' },
    { n: 'Veilkite', cost: 48, sz: 18, spd: 34, school: 0.1, shy: 0.2, bottom: 0, vent: 0, greed: 0.6, col: '#c39bff', fin: '#7b5bd6', desc: 'Slow drifter' },
    { n: 'Pebbleback', cost: 30, sz: 13, spd: 44, school: 0.15, shy: 0.5, bottom: 1, vent: 0, greed: 0.8, col: '#9fb2a0', fin: '#65786a', desc: 'Hugs the floor' },
    { n: 'Sunspine', cost: 38, sz: 11, spd: 58, school: 0.3, shy: 1.0, bottom: 0, vent: 0, greed: 0.7, col: '#ffd45e', fin: '#c99418', desc: 'Hides in plants' },
    { n: 'Vent Goby', cost: 44, sz: 10, spd: 52, school: 0.2, shy: 0.2, bottom: 0.3, vent: 1, greed: 0.8, col: '#7effc0', fin: '#28a877', desc: 'Bubbles at vents' }
  ];

  var MAXF = 24, MAXD = 24, MAXFOOD = 36, MAXBUB = 70;

  var T = G.tank = {
    fish: [], decor: [], food: [], bub: [], fed: 0.35,
    dragId: -1, drag: null, t: 0, rect: null, msg: '', msgT: 0
  };

  T.rectCalc = function () {
    var pa = G.LAY.play;
    T.rect = { x: pa.x + 8, y: pa.y + 46, w: pa.w - 16, h: pa.h - 46 - 34 };
  };

  /* ---- comfort ---- */
  T.stats = function () {
    var pl = 0, hd = 0, fl = 0, sp = {};
    for (var i = 0; i < T.decor.length; i++) {
      var d = DECOR[T.decor[i].k];
      if (!d) continue;
      pl += d.plant; hd += d.hide; fl += d.filt;
    }
    for (var j = 0; j < T.fish.length; j++) sp[T.fish[j].s] = 1;
    var variety = Object.keys(sp).length;
    var comfort = Math.min(100, Math.round(pl * 5 + hd * 5 + fl * 6 + variety * 3 + T.fed * 26));
    return { plants: pl, hides: hd, filters: fl, variety: variety, comfort: comfort };
  };

  /* ---- entities ---- */
  T.addFish = function (s, x, y) {
    if (T.fish.length >= MAXF) return false;
    var r = T.rect;
    var f = FISH[s];
    T.fish.push({
      s: s, x: x === undefined ? r.x + 20 + Math.random() * (r.w - 40) : x,
      y: y === undefined ? r.y + 30 + Math.random() * (r.h - 70) : y,
      vx: (Math.random() - 0.5) * 30, vy: 0, tx: 0, ty: 0, rt: 0, dir: 1,
      belly: 0.5, ph: Math.random() * 6.283, bt: Math.random() * 3
    });
    return true;
  };
  T.addDecor = function (k, v, x, y) {
    if (T.decor.length >= MAXD) return false;
    var r = T.rect;
    T.decor.push({
      k: k, v: v,
      x: x === undefined ? 0.15 + Math.random() * 0.7 : x,
      y: y === undefined ? 0.86 + Math.random() * 0.08 : y
    });
    return true;
  };
  T.dropFood = function (x, y) {
    if (T.food.length >= MAXFOOD) T.food.shift();
    T.food.push({ x: x, y: y, vy: 10 + Math.random() * 10, vx: (Math.random() - 0.5) * 8, life: 26 });
    G.audio.sfx('plop');
    G.spark(x, y, '#cfe9ff', 4, 60, 0.4, 60, 2);
  };

  /* ---- sim ---- */
  T.update = function (dt) {
    var r = T.rect;
    if (!r) return;
    if (T.msgT > 0) T.msgT -= dt;

    // food
    for (var i = T.food.length - 1; i >= 0; i--) {
      var fd = T.food[i];
      fd.life -= dt;
      fd.vy = Math.min(26, fd.vy + 8 * dt);
      fd.x += fd.vx * dt; fd.vx *= (1 - dt);
      fd.y += fd.vy * dt;
      if (fd.y > r.y + r.h - 6) { fd.y = r.y + r.h - 6; fd.vy = 0; }
      if (fd.life <= 0) T.food.splice(i, 1);
    }

    // bubbles from vents
    var vents = [];
    for (i = 0; i < T.decor.length; i++) {
      var dd = DECOR[T.decor[i].k];
      if (dd && dd.filt) vents.push(T.decor[i]);
    }
    if (vents.length && T.bub.length < MAXBUB && Math.random() < dt * 9) {
      var vv = vents[(Math.random() * vents.length) | 0];
      T.bub.push({ x: r.x + vv.x * r.w + (Math.random() - 0.5) * 14, y: r.y + vv.y * r.h - 10, r: 1.6 + Math.random() * 2.6, ph: Math.random() * 6.28 });
    }
    for (i = T.bub.length - 1; i >= 0; i--) {
      var b = T.bub[i];
      b.y -= (26 + b.r * 6) * dt;
      b.x += Math.sin(T.t * 2 + b.ph) * 8 * dt;
      if (b.y < r.y + 4) T.bub.splice(i, 1);
    }
    if (T.bub.length > MAXBUB) T.bub.splice(0, T.bub.length - MAXBUB);

    // hunger decay (slow, no gate: feeding is free & instant)
    T.fed = G.clamp(T.fed - dt * 0.006, 0, 1);

    // fish AI
    var plants = [], hides = [];
    for (i = 0; i < T.decor.length; i++) {
      var dc = DECOR[T.decor[i].k];
      if (!dc) continue;
      var px = r.x + T.decor[i].x * r.w, py = r.y + T.decor[i].y * r.h - dc.h[T.decor[i].v] * 0.4;
      if (dc.plant) plants.push({ x: px, y: py });
      if (dc.hide) hides.push({ x: px, y: py });
    }
    var ventPts = vents.map(function (v) { return { x: r.x + v.x * r.w, y: r.y + v.y * r.h - 20 }; });

    for (i = 0; i < T.fish.length; i++) {
      var f = T.fish[i], sp = FISH[f.s];
      f.rt -= dt; f.bt -= dt;
      f.belly = G.clamp(f.belly - dt * 0.012, 0, 1);

      var ax = 0, ay = 0;
      // wander target
      if (f.rt <= 0 || f.tx === 0) {
        f.rt = 1.6 + Math.random() * 3.2;
        f.tx = r.x + 24 + Math.random() * (r.w - 48);
        f.ty = r.y + 24 + Math.random() * (r.h - 52);
        if (sp.bottom) f.ty = r.y + r.h - 18 - Math.random() * 40 * (1 - sp.bottom);
        if (sp.vent && ventPts.length && Math.random() < 0.7) {
          var vp = ventPts[(Math.random() * ventPts.length) | 0];
          f.tx = vp.x + (Math.random() - 0.5) * 40; f.ty = vp.y - Math.random() * 30;
        } else if (sp.shy > 0.5 && plants.length && Math.random() < sp.shy * 0.8) {
          var pp = plants[(Math.random() * plants.length) | 0];
          f.tx = pp.x + (Math.random() - 0.5) * 34; f.ty = pp.y + (Math.random() - 0.5) * 26;
        } else if (sp.shy > 0.3 && hides.length && Math.random() < 0.4) {
          var hp = hides[(Math.random() * hides.length) | 0];
          f.tx = hp.x + (Math.random() - 0.5) * 30; f.ty = hp.y;
        }
      }

      // food seeking
      var best = null, bd = 1e9;
      for (var q = 0; q < T.food.length; q++) {
        var d2 = G.dist(f.x, f.y, T.food[q].x, T.food[q].y);
        if (d2 < bd) { bd = d2; best = T.food[q]; }
      }
      var hungry = 1 - f.belly;
      if (best && bd < 40 + 190 * sp.greed * hungry) {
        ax += (best.x - f.x) * 2.4 * sp.greed;
        ay += (best.y - f.y) * 2.4 * sp.greed;
        if (bd < 9 + sp.sz * 0.4) {
          var fi = T.food.indexOf(best);
          if (fi >= 0) T.food.splice(fi, 1);
          f.belly = G.clamp(f.belly + 0.32, 0, 1);
          T.fed = G.clamp(T.fed + 0.035, 0, 1);
          G.audio.sfx('eat');
          G.spark(best.x, best.y, '#ffe9a8', 3, 45, 0.35, 30, 2);
        }
      } else {
        ax += (f.tx - f.x) * 0.9;
        ay += (f.ty - f.y) * 0.9;
        // schooling
        if (sp.school > 0.2) {
          var cx = 0, cy = 0, n = 0, sx = 0, sy = 0;
          for (var j = 0; j < T.fish.length; j++) {
            if (j === i) continue;
            var o = T.fish[j];
            if (o.s !== f.s) continue;
            var dd2 = G.dist(f.x, f.y, o.x, o.y);
            if (dd2 < 110) { cx += o.x; cy += o.y; n++; if (dd2 < 22 && dd2 > 0.01) { sx += (f.x - o.x) / dd2; sy += (f.y - o.y) / dd2; } }
          }
          if (n) {
            ax += ((cx / n) - f.x) * 1.5 * sp.school;
            ay += ((cy / n) - f.y) * 1.5 * sp.school;
            ax += sx * 190 * sp.school; ay += sy * 190 * sp.school;
          }
        }
      }
      // walls
      var m = 16 + sp.sz;
      if (f.x < r.x + m) ax += (r.x + m - f.x) * 8;
      if (f.x > r.x + r.w - m) ax -= (f.x - (r.x + r.w - m)) * 8;
      if (f.y < r.y + m) ay += (r.y + m - f.y) * 8;
      if (f.y > r.y + r.h - m * 0.7) ay -= (f.y - (r.y + r.h - m * 0.7)) * 8;

      f.vx += ax * dt; f.vy += ay * dt;
      var damp = Math.pow(0.02, dt);
      f.vx *= damp; f.vy *= damp;
      var sp2 = Math.sqrt(f.vx * f.vx + f.vy * f.vy);
      var maxs = sp.spd * (best && bd < 150 ? 1.7 : 1);
      if (sp2 > maxs) { f.vx = f.vx / sp2 * maxs; f.vy = f.vy / sp2 * maxs; }
      f.x += f.vx * dt; f.y += f.vy * dt;
      f.x = G.clamp(f.x, r.x + 6, r.x + r.w - 6);
      f.y = G.clamp(f.y, r.y + 6, r.y + r.h - 6);
      if (Math.abs(f.vx) > 6) f.dir = f.vx > 0 ? 1 : -1;
      f.ph += dt * (3 + sp2 * 0.05);

      // vent goby bubbling
      if (sp.vent && f.bt <= 0 && T.bub.length < MAXBUB) {
        f.bt = 0.8 + Math.random() * 1.6;
        T.bub.push({ x: f.x + f.dir * sp.sz, y: f.y - 2, r: 1.2 + Math.random() * 1.6, ph: Math.random() * 6.28 });
      }
    }
    if (T.fish.length > MAXF) T.fish.length = MAXF;
    if (T.decor.length > MAXD) T.decor.length = MAXD;
  };

  /* ---- drawing ---- */
  function drawDecor(d, hl) {
    var r = T.rect;
    drawDecorAt(d.k, d.v, r.x + d.x * r.w, r.y + d.y * r.h, 1, hl, d.x);
  }
  function drawDecorAt(kk, vv, x, y, scale, hl, phase) {
    var c = G.ctx, def = DECOR[kk];
    if (!def) return;
    var d = { k: kk, v: vv, x: phase === undefined ? 0.5 : phase };
    var h = def.h[d.v], col = def.col[d.v];
    c.save();
    if (scale !== 1) { c.translate(x, y); c.scale(scale, scale); c.translate(-x, -y); }
    if (hl) { c.shadowColor = '#ffe08a'; c.shadowBlur = 14; }
    c.fillStyle = col;
    var sway = Math.sin(T.t * 1.1 + d.x * 9) * 5;
    switch (def.k) {
      case 'kelp':
        for (var i = 0; i < 3; i++) {
          var ox = (i - 1) * 9;
          c.beginPath(); c.lineWidth = 7; c.strokeStyle = col; c.lineCap = 'round';
          c.moveTo(x + ox, y);
          c.quadraticCurveTo(x + ox + sway * (1 + i * 0.3), y - h * 0.6, x + ox + sway * 1.6, y - h);
          c.stroke();
        }
        break;
      case 'fan':
        c.beginPath();
        c.moveTo(x, y);
        for (var a = 0; a <= 10; a++) {
          var t2 = a / 10, ang = Math.PI * (0.15 + t2 * 0.7);
          var rr = h * (d.v === 1 ? 1.0 : 0.85);
          c.lineTo(x - Math.cos(ang) * rr * (d.v === 1 ? 0.45 : 0.8), y - Math.sin(ang) * rr);
        }
        c.closePath(); c.fill();
        c.fillStyle = 'rgba(0,0,0,0.18)';
        for (var b2 = 1; b2 < 4; b2++) { c.fillRect(x - 1 + (b2 - 2) * 8, y - h * 0.5, 2, h * 0.5); }
        break;
      case 'arch':
        c.beginPath();
        c.moveTo(x - 34, y); c.lineTo(x - 34, y - h * 0.55);
        c.quadraticCurveTo(x, y - h * 1.5, x + 34, y - h * 0.55); c.lineTo(x + 34, y);
        c.lineTo(x + 18, y); c.lineTo(x + 18, y - h * 0.5);
        c.quadraticCurveTo(x, y - h * 1.05, x - 18, y - h * 0.5); c.lineTo(x - 18, y);
        c.closePath(); c.fill();
        break;
      case 'log':
        c.beginPath(); c.ellipse(x, y - h * 0.4, 34, h * 0.42, 0, 0, 6.283); c.fill();
        c.fillStyle = '#20303a'; c.beginPath(); c.ellipse(x - 22, y - h * 0.4, 11, h * 0.32, 0, 0, 6.283); c.fill();
        break;
      case 'vent':
        c.fillStyle = '#4a6470'; G.rr(x - h * 0.28, y - h * 0.7, h * 0.56, h * 0.7, 6); c.fill();
        c.fillStyle = col; G.rr(x - h * 0.2, y - h * 0.62, h * 0.4, h * 0.16, 4); c.fill();
        c.fillStyle = 'rgba(255,255,255,0.5)';
        for (var v = 0; v < 3; v++) c.fillRect(x - h * 0.18 + v * h * 0.15, y - h * 0.34, h * 0.08, h * 0.22);
        break;
      case 'anem':
        for (var t3 = 0; t3 < 9; t3++) {
          var an = -Math.PI * (0.15 + t3 / 8 * 0.7);
          var wob = Math.sin(T.t * 2.2 + t3) * 6;
          c.beginPath(); c.lineWidth = 5; c.lineCap = 'round'; c.strokeStyle = col;
          c.moveTo(x, y - 4);
          c.quadraticCurveTo(x + Math.cos(an) * h * 0.4, y + Math.sin(an) * h * 0.5,
            x + Math.cos(an) * h * 0.6 + wob, y + Math.sin(an) * h * 0.85);
          c.stroke();
        }
        c.fillStyle = '#5a4a6a'; c.beginPath(); c.ellipse(x, y - 2, 14, 7, 0, 0, 6.283); c.fill();
        break;
      case 'shell':
        for (var s2 = 0; s2 < 3; s2++) {
          var sx2 = x + (s2 - 1) * 15, sy2 = y - (s2 === 1 ? 6 : 0);
          c.fillStyle = col;
          c.beginPath(); c.arc(sx2, sy2, h * 0.35, Math.PI, 0); c.closePath(); c.fill();
          c.strokeStyle = 'rgba(0,0,0,0.2)'; c.lineWidth = 1.5;
          c.beginPath(); c.arc(sx2, sy2, h * 0.2, Math.PI, 0); c.stroke();
        }
        break;
      default:
        c.beginPath();
        c.moveTo(x - 46, y);
        c.quadraticCurveTo(x - 20, y - h, x + 6, y - h * 0.7);
        c.quadraticCurveTo(x + 30, y - h * 0.4, x + 48, y);
        c.closePath(); c.fill();
    }
    c.restore();
  }

  function drawFish(f) {
    var c = G.ctx, sp = FISH[f.s], s = sp.sz;
    c.save();
    c.translate(f.x, f.y);
    c.scale(f.dir, 1);
    var wob = Math.sin(f.ph) * 0.25;
    c.rotate(G.clamp(f.vy * f.dir * 0.004, -0.5, 0.5));
    // tail
    c.fillStyle = sp.fin;
    c.beginPath();
    c.moveTo(-s * 0.8, 0);
    c.lineTo(-s * 1.8, -s * 0.7 + wob * s);
    c.lineTo(-s * 1.55, 0);
    c.lineTo(-s * 1.8, s * 0.7 + wob * s);
    c.closePath(); c.fill();
    // fins
    c.beginPath(); c.moveTo(-s * 0.1, -s * 0.45); c.lineTo(s * 0.3, -s * 1.1 - wob * s * 0.4); c.lineTo(s * 0.55, -s * 0.35); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(-s * 0.1, s * 0.4); c.lineTo(s * 0.1, s * 0.95); c.lineTo(s * 0.5, s * 0.3); c.closePath(); c.fill();
    // body
    c.fillStyle = sp.col;
    c.beginPath(); c.ellipse(0, 0, s * 1.15, s * 0.66, 0, 0, 6.283); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.22)';
    c.beginPath(); c.ellipse(-s * 0.1, -s * 0.2, s * 0.75, s * 0.24, 0, 0, 6.283); c.fill();
    // eye
    c.fillStyle = '#0d2029';
    c.beginPath(); c.arc(s * 0.62, -s * 0.14, s * 0.16, 0, 6.283); c.fill();
    c.fillStyle = '#fff';
    c.beginPath(); c.arc(s * 0.67, -s * 0.19, s * 0.06, 0, 6.283); c.fill();
    c.restore();
    if (f.belly < 0.25) {
      G.text('!', f.x, f.y - s * 1.6, 14, 'rgba(255,220,120,' + (0.5 + Math.sin(T.t * 6) * 0.4).toFixed(2) + ')', 'center');
    }
  }

  T.draw = function (interactive) {
    var c = G.ctx, r = T.rect;
    c.save();
    G.rr(r.x, r.y, r.w, r.h, 14); c.clip();
    var g = c.createLinearGradient(0, r.y, 0, r.y + r.h);
    g.addColorStop(0, '#0d5f80'); g.addColorStop(0.55, '#0a4260'); g.addColorStop(1, '#07293f');
    c.fillStyle = g; c.fillRect(r.x, r.y, r.w, r.h);
    // caustics
    c.globalAlpha = 0.09; c.strokeStyle = '#bff0ff'; c.lineWidth = 6;
    for (var i = 0; i < 5; i++) {
      c.beginPath();
      for (var x = 0; x <= r.w; x += 18) {
        var y = r.y + 24 + i * 30 + Math.sin((x * 0.03) + T.t * 0.8 + i) * 9;
        if (x === 0) c.moveTo(r.x + x, y); else c.lineTo(r.x + x, y);
      }
      c.stroke();
    }
    c.globalAlpha = 1;
    // sand
    c.fillStyle = '#d8bd88';
    c.beginPath();
    c.moveTo(r.x, r.y + r.h);
    c.lineTo(r.x, r.y + r.h - 22);
    for (var sx = 0; sx <= r.w; sx += 24) c.lineTo(r.x + sx, r.y + r.h - 22 + Math.sin(sx * 0.05) * 5);
    c.lineTo(r.x + r.w, r.y + r.h);
    c.closePath(); c.fill();

    for (i = 0; i < T.decor.length; i++) drawDecor(T.decor[i], T.drag === T.decor[i]);
    for (i = 0; i < T.food.length; i++) {
      var fd = T.food[i];
      c.fillStyle = '#ffdf9a';
      c.beginPath(); c.arc(fd.x, fd.y, 2.6, 0, 6.283); c.fill();
    }
    for (i = 0; i < T.fish.length; i++) drawFish(T.fish[i]);
    for (i = 0; i < T.bub.length; i++) {
      var b = T.bub[i];
      c.strokeStyle = 'rgba(200,240,255,0.55)'; c.lineWidth = 1.2;
      c.beginPath(); c.arc(b.x, b.y, b.r, 0, 6.283); c.stroke();
    }
    // glass
    c.strokeStyle = 'rgba(180,230,255,0.35)'; c.lineWidth = 3;
    G.rr(r.x + 1, r.y + 1, r.w - 2, r.h - 2, 13); c.stroke();
    c.restore();
  };

  /* ---- tank screen input ---- */
  function hitDecor(x, y) {
    var r = T.rect;
    for (var i = T.decor.length - 1; i >= 0; i--) {
      var d = T.decor[i], def = DECOR[d.k];
      if (!def) continue;
      var dx = r.x + d.x * r.w, dy = r.y + d.y * r.h, h = def.h[d.v];
      if (x > dx - 40 && x < dx + 40 && y > dy - h - 6 && y < dy + 14) return d;
    }
    return null;
  }
  T.down = function (rec) {
    var r = T.rect;
    if (rec.x < r.x || rec.x > r.x + r.w || rec.y < r.y || rec.y > r.y + r.h) return;
    if (T.dragId !== -1) return;
    if (T.dragId === -1) {
      var d = hitDecor(rec.x, rec.y);
      if (d) {
        T.dragId = rec.id; T.drag = d; rec.grab = true;
        G.audio.sfx('tap');
        return;
      }
    }
    rec.tank = true;
  };
  T.move = function (rec) {
    if (rec.id === T.dragId && T.drag) {
      var r = T.rect;
      T.drag.x = G.clamp((rec.x - r.x) / r.w, 0.06, 0.94);
      T.drag.y = G.clamp((rec.y - r.y) / r.h, 0.42, 0.97);
    }
  };
  T.up = function (rec) {
    if (rec.id === T.dragId) {
      T.dragId = -1; T.drag = null;
      G.saveGame();
      return;
    }
    if (rec.tank) {
      var moved = Math.abs(rec.x - rec.sx) + Math.abs(rec.y - rec.sy);
      if (moved < 14) T.dropFood(rec.x, rec.y);
    }
  };
  T.cancel = function (rec) {
    if (rec.id === T.dragId) { T.dragId = -1; T.drag = null; }
    rec.tank = false;
  };
  T.resetInput = function () { T.dragId = -1; T.drag = null; };

  T.drawDecorAt = drawDecorAt;
  T.drawFishAt = function (s, x, y, scale) {
    var c = G.ctx;
    c.save(); c.translate(x, y); c.scale(scale, scale);
    drawFish({ s: s, x: 0, y: 0, dir: 1, vx: 10, vy: 0, ph: T.t * 3 + s, belly: 1 });
    c.restore();
  };

  T.serialize = function () {
    return {
      fed: T.fed,
      fish: T.fish.slice(0, MAXF).map(function (f) { return [f.s, +f.belly.toFixed(2)]; }),
      decor: T.decor.slice(0, MAXD).map(function (d) { return [d.k, d.v, +d.x.toFixed(3), +d.y.toFixed(3)]; })
    };
  };
  T.load = function (o) {
    T.fish.length = 0; T.decor.length = 0; T.food.length = 0; T.bub.length = 0;
    T.fed = G.num(o && o.fed, 0.35, 0, 1);
    var fl = (o && Array.isArray(o.fish)) ? o.fish : [];
    for (var i = 0; i < fl.length && T.fish.length < MAXF; i++) {
      var e = fl[i];
      if (!Array.isArray(e)) continue;
      var s = G.int(e[0], -1, 0, FISH.length - 1);
      if (s < 0 || s >= FISH.length) continue;
      if (T.addFish(s)) T.fish[T.fish.length - 1].belly = G.num(e[1], 0.5, 0, 1);
    }
    var dl = (o && Array.isArray(o.decor)) ? o.decor : [];
    for (i = 0; i < dl.length && T.decor.length < MAXD; i++) {
      var d = dl[i];
      if (!Array.isArray(d)) continue;
      var k = G.int(d[0], -1, 0, DECOR.length - 1);
      var v = G.int(d[1], 0, 0, 1);
      if (k < 0 || k >= DECOR.length) continue;
      T.addDecor(k, v, G.num(d[2], 0.5, 0.06, 0.94), G.num(d[3], 0.9, 0.42, 0.97));
    }
  };
})();
