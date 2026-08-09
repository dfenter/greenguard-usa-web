/* Carnival Reels - machine views: symbol art + spin animation. */
(function (root) {
  'use strict';
  var U = root.CR.U, D = root.CR.D, Audio = root.CR.Audio;
  var M = root.CR_MACHINES;

  /* ---------------- symbol art (greybox, readable) ---------------- */
  var COL = {
    CH: '#ff4d6d', LE: '#ffd93d', PL: '#a76bff', BE: '#4dd2ff', ST: '#fff3c4', SE: '#ff9f45',
    LAN: '#e8913c', KEY: '#c9d4e0', SKU: '#eef3f8', GHO: '#8ee8ff', COIN: '#ffd76b'
  };
  var GEMC = ['#8794a3', '#3fbf7f', '#e0a83c', '#e0603c', '#4a86e8', '#dd4fe0'];

  function drawSym(g, k, cx, cy, r) {
    g.save();
    g.translate(cx, cy);
    var c = COL[k] || '#888';
    g.fillStyle = c; g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 2;
    switch (k) {
      case 'CH':
        g.beginPath(); g.arc(-r * 0.36, r * 0.34, r * 0.42, 0, 6.284); g.fill();
        g.beginPath(); g.arc(r * 0.38, r * 0.44, r * 0.36, 0, 6.284); g.fill();
        g.strokeStyle = '#5fbf5f'; g.lineWidth = r * 0.13;
        g.beginPath(); g.moveTo(-r * 0.36, r * 0.34); g.quadraticCurveTo(0, -r * 0.7, r * 0.1, -r * 0.85);
        g.moveTo(r * 0.38, r * 0.44); g.quadraticCurveTo(r * 0.3, -r * 0.4, r * 0.1, -r * 0.85); g.stroke();
        break;
      case 'LE':
        g.beginPath(); g.ellipse(0, 0, r * 0.82, r * 0.56, -0.35, 0, 6.284); g.fill();
        g.fillStyle = 'rgba(255,255,255,.5)';
        g.beginPath(); g.ellipse(-r * 0.24, -r * 0.2, r * 0.24, r * 0.12, -0.35, 0, 6.284); g.fill();
        break;
      case 'PL':
        g.beginPath(); g.arc(0, r * 0.06, r * 0.72, 0, 6.284); g.fill();
        g.fillStyle = 'rgba(0,0,0,.28)';
        g.beginPath(); g.ellipse(0, r * 0.06, r * 0.1, r * 0.7, 0, 0, 6.284); g.fill();
        g.fillStyle = 'rgba(255,255,255,.45)';
        g.beginPath(); g.arc(-r * 0.28, -r * 0.3, r * 0.16, 0, 6.284); g.fill();
        break;
      case 'BE':
        g.beginPath();
        g.moveTo(-r * 0.72, r * 0.42); g.quadraticCurveTo(-r * 0.5, -r * 0.75, 0, -r * 0.75);
        g.quadraticCurveTo(r * 0.5, -r * 0.75, r * 0.72, r * 0.42); g.closePath(); g.fill();
        g.fillRect(-r * 0.82, r * 0.42, r * 1.64, r * 0.18);
        g.beginPath(); g.arc(0, r * 0.74, r * 0.2, 0, 6.284); g.fill();
        break;
      case 'ST':
        D.star(g, 0, 0, r * 0.86, 5, 0.44); g.fill();
        break;
      case 'SE':
        g.fillStyle = c;
        D.rr(g, -r * 0.62, -r * 0.78, r * 1.24, r * 1.56, r * 0.18); g.fill();
        D.text(g, '7', 0, r * 0.06, r * 1.25, '#241206', 'center', '800');
        break;
      case 'LAN':
        g.strokeStyle = '#9a6b2a'; g.lineWidth = r * 0.12;
        g.beginPath(); g.arc(0, -r * 0.72, r * 0.3, Math.PI, 0); g.stroke();
        g.fillStyle = c;
        g.beginPath();
        g.moveTo(-r * 0.34, -r * 0.5); g.lineTo(r * 0.34, -r * 0.5);
        g.lineTo(r * 0.5, r * 0.5); g.lineTo(-r * 0.5, r * 0.5); g.closePath(); g.fill();
        g.fillStyle = 'rgba(255,246,200,.75)';
        g.beginPath(); g.arc(0, r * 0.02, r * 0.19, 0, 6.284); g.fill();
        g.fillStyle = '#7a5216';
        g.fillRect(-r * 0.42, -r * 0.6, r * 0.84, r * 0.14);
        g.fillRect(-r * 0.56, r * 0.48, r * 1.12, r * 0.16);
        break;
      case 'KEY':
        g.strokeStyle = c; g.lineWidth = r * 0.2;
        g.beginPath(); g.arc(-r * 0.34, -r * 0.2, r * 0.34, 0, 6.284); g.stroke();
        g.fillStyle = c;
        g.fillRect(-r * 0.1, -r * 0.1, r * 0.16, r * 0.95);
        g.fillRect(-r * 0.1, r * 0.45, r * 0.44, r * 0.15);
        g.fillRect(-r * 0.1, r * 0.72, r * 0.36, r * 0.15);
        break;
      case 'SKU':
        g.beginPath(); g.arc(0, -r * 0.14, r * 0.62, 0, 6.284); g.fill();
        g.fillRect(-r * 0.38, r * 0.28, r * 0.76, r * 0.42);
        g.fillStyle = '#1b2028';
        g.beginPath(); g.arc(-r * 0.24, -r * 0.2, r * 0.17, 0, 6.284); g.fill();
        g.beginPath(); g.arc(r * 0.24, -r * 0.2, r * 0.17, 0, 6.284); g.fill();
        g.fillRect(-r * 0.16, r * 0.3, r * 0.1, r * 0.4);
        g.fillRect(r * 0.06, r * 0.3, r * 0.1, r * 0.4);
        break;
      case 'GHO':
        g.beginPath();
        g.arc(0, -r * 0.12, r * 0.62, Math.PI, 0);
        g.lineTo(r * 0.62, r * 0.56);
        for (var i = 0; i < 3; i++) {
          g.quadraticCurveTo(r * (0.41 - i * 0.41), r * 0.9, r * (0.21 - i * 0.41), r * 0.56);
        }
        g.lineTo(-r * 0.62, r * 0.56); g.closePath(); g.fill();
        g.fillStyle = '#12303c';
        g.beginPath(); g.arc(-r * 0.22, -r * 0.14, r * 0.13, 0, 6.284); g.fill();
        g.beginPath(); g.arc(r * 0.22, -r * 0.14, r * 0.13, 0, 6.284); g.fill();
        break;
      case 'COIN':
        g.beginPath(); g.arc(0, 0, r * 0.78, 0, 6.284); g.fill();
        g.strokeStyle = '#9a6b12'; g.lineWidth = r * 0.1;
        g.beginPath(); g.arc(0, 0, r * 0.55, 0, 6.284); g.stroke();
        g.fillStyle = '#9a6b12';
        D.text(g, '$', 0, r * 0.02, r * 0.72, '#8a5f10', 'center', '800');
        break;
      default:
        g.fillRect(-r * 0.6, -r * 0.6, r * 1.2, r * 1.2);
    }
    g.restore();
  }

  function drawGem(g, tier, cx, cy, s, alpha) {
    g.save(); g.translate(cx, cy);
    g.globalAlpha = alpha === undefined ? 1 : alpha;
    g.fillStyle = GEMC[tier];
    var r = s * 0.42, i, a;
    g.beginPath();
    if (tier === 0) { g.rect(-r * 0.82, -r * 0.82, r * 1.64, r * 1.64); }
    else if (tier === 1) { g.moveTo(0, -r); g.lineTo(r, 0); g.lineTo(0, r); g.lineTo(-r, 0); g.closePath(); }
    else if (tier === 2) {
      for (i = 0; i < 6; i++) { a = i / 6 * 6.2832 - 1.5708; g[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); } g.closePath();
    }
    else if (tier === 3) {
      for (i = 0; i < 3; i++) { a = i / 3 * 6.2832 - 1.5708; g[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r * 1.1, Math.sin(a) * r * 1.1); } g.closePath();
    }
    else if (tier === 4) {
      for (i = 0; i < 8; i++) { a = i / 8 * 6.2832; g[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); } g.closePath();
    }
    else { D.star(g, 0, 0, r * 1.1, 6, 0.5); }
    g.fill();
    g.fillStyle = 'rgba(255,255,255,.32)';
    g.beginPath(); g.arc(-r * 0.28, -r * 0.3, r * 0.2, 0, 6.284); g.fill();
    g.restore();
    g.globalAlpha = 1;
  }

  /* ---------------- shared view base ---------------- */
  function base(v) {
    v.done = true; v.t = 0; v.res = null;
    v.reset = v.reset || function () { this.done = true; this.t = 0; this.res = null; };
    return v;
  }
  function panelBG(g, r) {
    g.fillStyle = '#141b26';
    D.rr(g, r.x + 8, r.y + 4, r.w - 16, r.h - 8, 14); g.fill();
    g.strokeStyle = '#26364a'; g.lineWidth = 2; g.stroke();
  }

  /* ================= view A - Orchard Classic ================= */
  var CELL = 76;
  var viewA = base({
    reels: [{ pos: 3.5 }, { pos: 17.2 }, { pos: 29.8 }],
    begin: function (res, fx) {
      this.res = res; this.t = 0; this.done = false; this.fx = fx; this.settled = 0;
      for (var i = 0; i < 3; i++) {
        var r = this.reels[i];
        r.phase = 'spin'; r.vel = 0; r.stopAt = 0.5 + i * 0.34; r.top = 44 + i * 5;
        r.tw = 0; r.startPos = r.pos; r.endPos = 0; r.ticked = false;
      }
      Audio.spinUp();
    },
    reset: function () {
      this.done = true; this.t = 0; this.res = null;
      for (var i = 0; i < 3; i++) { this.reels[i].phase = 'idle'; this.reels[i].vel = 0; }
    },
    update: function (dt) {
      if (this.done) return;
      this.t += dt;
      var N = M.A.strip.length, all = true;
      for (var i = 0; i < 3; i++) {
        var r = this.reels[i];
        if (r.phase === 'spin') {
          all = false;
          r.vel = Math.min(r.top, r.vel + 190 * dt);
          r.pos = (r.pos + r.vel * dt) % N;
          if (this.t >= r.stopAt) {
            var base0 = Math.ceil(r.pos) + 4;
            r.startPos = r.pos;
            r.endPos = base0 + ((this.res.stops[i] - base0) % N + N) % N;
            r.phase = 'stop'; r.tw = 0;
          }
        } else if (r.phase === 'stop') {
          all = false;
          r.tw += dt / 0.52;
          var t = Math.min(1, r.tw), e = U.easeOut(t);
          var over = Math.sin(Math.min(1, t) * Math.PI) * 0.16;
          r.pos = U.lerp(r.startPos, r.endPos, e) + over;
          if (t >= 1) {
            r.pos = r.endPos % N; r.phase = 'idle';
            Audio.tick(i); this.fx.shake(3 + i);
            this.settled++;
          }
        }
      }
      if (all && this.t > 0.4) { this.done = true; }
    },
    draw: function (g, r, flash) {
      panelBG(g, r);
      var N = M.A.strip.length, w = 96, gap = 10;
      var x0 = r.x + (r.w - (w * 3 + gap * 2)) / 2;
      var cy = r.y + r.h / 2 - 6;
      // payline
      g.fillStyle = flash > 0 ? 'rgba(255,220,120,' + (0.1 + flash * 0.25) + ')' : 'rgba(255,220,120,0.07)';
      g.fillRect(x0 - 6, cy - CELL / 2, w * 3 + gap * 2 + 12, CELL);
      for (var i = 0; i < 3; i++) {
        var rx = x0 + i * (w + gap), rr = this.reels[i];
        g.save();
        g.beginPath(); D.rr(g, rx, cy - CELL * 1.5, w, CELL * 3, 10); g.clip();
        g.fillStyle = '#0c121b'; g.fillRect(rx, cy - CELL * 1.5, w, CELL * 3);
        var idx = Math.floor(rr.pos), frac = rr.pos - idx;
        var blur = rr.phase === 'spin' ? Math.min(1, rr.vel / 30) : 0;
        for (var o = -2; o <= 2; o++) {
          var s = M.A.strip[((idx + o) % N + N) % N];
          var y = cy + (o - frac) * CELL;
          if (y < cy - CELL * 2 || y > cy + CELL * 2) continue;
          var isLine = Math.abs(y - cy) < 4;
          g.globalAlpha = blur > 0.3 ? 0.5 : (isLine ? 1 : 0.55);
          drawSym(g, s, rx + w / 2, y, 27 * (blur > 0.3 ? 0.9 : 1));
        }
        g.globalAlpha = 1;
        if (blur > 0.3) {
          g.fillStyle = 'rgba(12,18,27,0.35)';
          for (var b = 0; b < 6; b++) g.fillRect(rx, cy - CELL * 1.5 + b * CELL * 0.5, w, 3);
        }
        g.restore();
        g.strokeStyle = rr.phase === 'idle' ? '#3a5170' : '#26364a';
        g.lineWidth = 2; D.rr(g, rx, cy - CELL * 1.5, w, CELL * 3, 10); g.stroke();
      }
      // win box
      if (flash > 0 && this.res && this.res.mult > 0) {
        g.strokeStyle = 'rgba(255,214,102,' + (0.4 + flash * 0.6) + ')';
        g.lineWidth = 3;
        D.rr(g, x0 - 5, cy - CELL / 2 - 5, w * 3 + gap * 2 + 10, CELL + 10, 10); g.stroke();
      }
      D.text(g, 'PAYLINE', r.x + r.w / 2, cy + CELL * 1.5 + 16, 10, '#5c7a99', 'center');
    }
  });

  /* ================= view B - Ghost Train ================= */
  var viewB = base({
    cellState: [],
    ensure: function () {
      if (this.cellState.length === 5) return;
      this.cellState = [];
      for (var i = 0; i < 5; i++)
        this.cellState.push({ pos: 2.5 + i * 3.7, vel: 0, stopAt: 0, phase: 'idle', tw: 0, sp: 0, ep: 0, flash: 0 });
    },
    begin: function (res, fx) {
      this.res = res; this.t = 0; this.done = false; this.fx = fx;
      this.phase = 'spin'; this.round = 0; this.rt = 0; this.shown = null;
      this.cellState = [];
      for (var i = 0; i < 5; i++) this.cellState.push({ pos: 2.5 + i * 3.7 + Math.random() * 3, vel: 0, stopAt: 0.42 + i * 0.2, phase: 'spin', tw: 0, sp: 0, ep: 0, flash: 0 });
      Audio.spinUp();
    },
    reset: function () { this.done = true; this.res = null; this.phase = 'idle'; this.cellState = []; this.ensure(); },
    update: function (dt) {
      if (this.done) return;
      this.t += dt;
      var N = M.B.strip.length, i;
      if (this.phase === 'spin') {
        var all = true;
        for (i = 0; i < 5; i++) {
          var c = this.cellState[i];
          if (c.phase === 'spin') {
            all = false;
            c.vel = Math.min(44, c.vel + 180 * dt);
            c.pos = (c.pos + c.vel * dt) % N;
            if (this.t >= c.stopAt) {
              var b0 = Math.ceil(c.pos) + 3;
              // find a strip index carrying the target symbol
              var target = -1;
              for (var k = 0; k < N; k++) { var q = (b0 + k) % N; if (M.B.strip[q] === this.res.cells[i]) { target = q; break; } }
              if (target < 0) target = b0 % N;
              c.sp = c.pos; c.ep = b0 + ((target - b0) % N + N) % N; c.phase = 'stop'; c.tw = 0;
            }
          } else if (c.phase === 'stop') {
            all = false;
            c.tw += dt / 0.4;
            var t = Math.min(1, c.tw);
            c.pos = U.lerp(c.sp, c.ep, U.easeOut(t));
            if (t >= 1) {
              c.pos = c.ep % N; c.phase = 'idle'; c.flash = 1;
              Audio.tick(i); this.fx.shake(3);
              if (this.res.cells[i] === 'COIN') Audio.coin(i);
            }
          }
          if (c.flash > 0) c.flash = Math.max(0, c.flash - dt * 2.5);
        }
        if (all) {
          if (this.res.bonus && this.res.bonus.rounds && this.res.bonus.rounds.length) {
            this.phase = 'bonus'; this.round = 0; this.rt = 0;
            this.shown = this.res.bonus.rounds[0].vals.slice();
            Audio.fanfare();
            this.fx.shake(10);
          } else if (this.t > 0.3) this.done = true;
        }
      } else if (this.phase === 'bonus') {
        this.rt += dt;
        var dur = this.round === 0 ? 0.9 : 0.75;
        if (this.rt >= dur) {
          this.rt = 0; this.round++;
          var rounds = this.res.bonus.rounds;
          if (this.round >= rounds.length) { this.phase = 'bonusEnd'; this.rt = 0; }
          else {
            var rd = rounds[this.round];
            this.shown = rd.vals.slice();
            for (i = 0; i < rd.gained.length; i++) {
              Audio.coin(i);
              this.cellState[rd.gained[i]].flash = 1;
              this.fx.burstAt(rd.gained[i], 5, 14, '#ffd76b');
            }
            if (rd.gained.length) this.fx.shake(8);
          }
        }
        for (i = 0; i < 5; i++) if (this.cellState[i].flash > 0) this.cellState[i].flash -= dt * 2;
      } else if (this.phase === 'bonusEnd') {
        this.rt += dt;
        if (this.rt > 0.7) this.done = true;
      }
    },
    cellRect: function (r, i) {
      var w = 66, gap = 6, x0 = r.x + (r.w - (w * 5 + gap * 4)) / 2;
      return { x: x0 + i * (w + gap), y: r.y + r.h / 2 - 24, w: w, h: 92 };
    },
    draw: function (g, r, flash) {
      panelBG(g, r);
      this.ensure();
      var N = M.B.strip.length, i;
      var inBonus = this.phase === 'bonus' || this.phase === 'bonusEnd';
      for (i = 0; i < 5; i++) {
        var b = this.cellRect(r, i), c = this.cellState[i] || { pos: 0, phase: 'idle', flash: 0 };
        var locked = inBonus && this.shown && this.shown[i] > 0;
        g.save();
        g.beginPath(); D.rr(g, b.x, b.y, b.w, b.h, 10); g.clip();
        g.fillStyle = locked ? '#2a2010' : '#0c121b';
        g.fillRect(b.x, b.y, b.w, b.h);
        if (locked) {
          drawSym(g, 'COIN', b.x + b.w / 2, b.y + b.h / 2 - 8, 24);
          D.text(g, U.mx(this.shown[i]), b.x + b.w / 2, b.y + b.h - 16, 15, '#ffe9a8', 'center', '800');
        } else if (inBonus) {
          var pulse = 0.35 + 0.25 * Math.sin(this.t * 9 + i);
          g.globalAlpha = pulse;
          drawSym(g, 'COIN', b.x + b.w / 2, b.y + b.h / 2, 22);
          g.globalAlpha = 1;
        } else {
          var idx = Math.floor(c.pos), frac = c.pos - idx;
          var blur = c.phase === 'spin' ? 1 : 0;
          for (var o = -1; o <= 1; o++) {
            var s = M.B.strip[((idx + o) % N + N) % N];
            var y = b.y + b.h / 2 + (o - frac) * b.h;
            g.globalAlpha = blur ? 0.55 : 1;
            drawSym(g, s, b.x + b.w / 2, y, 24);
          }
          g.globalAlpha = 1;
        }
        if (c.flash > 0) {
          g.fillStyle = 'rgba(255,235,170,' + (c.flash * 0.45) + ')';
          g.fillRect(b.x, b.y, b.w, b.h);
        }
        g.restore();
        g.lineWidth = 2;
        g.strokeStyle = locked ? '#ffcf5c' : (c.phase === 'idle' ? '#3a5170' : '#26364a');
        D.rr(g, b.x, b.y, b.w, b.h, 10); g.stroke();
      }
      var top = r.y + 26;
      if (inBonus) {
        var rd = this.res.bonus.rounds[Math.min(this.round, this.res.bonus.rounds.length - 1)];
        D.text(g, 'HOLD & RESPIN', r.x + r.w / 2, top, 15, '#ffcf5c', 'center', '800');
        var lbl = this.phase === 'bonusEnd' ? 'TRAIN COMPLETE  ' + U.mx(this.res.bonus.total) :
          'RESPINS LEFT: ' + rd.left + '   LOCKED ' + this.res.bonus.rounds[Math.min(this.round, this.res.bonus.rounds.length - 1)].vals.filter(function (v) { return v > 0; }).length + '/5';
        D.text(g, lbl, r.x + r.w / 2, top + 20, 12, '#c8d6e6', 'center');
      } else {
        D.text(g, 'PAYS ANYWHERE', r.x + r.w / 2, top, 12, '#5c7a99', 'center');
        D.text(g, '3+ COINS WAKE THE TRAIN', r.x + r.w / 2, top + 18, 11, '#7f93ab', 'center');
      }
      if (flash > 0 && this.res && this.res.mult > 0) {
        g.strokeStyle = 'rgba(255,214,102,' + (0.3 + flash * 0.6) + ')'; g.lineWidth = 3;
        var b0 = this.cellRect(r, 0), b4 = this.cellRect(r, 4);
        D.rr(g, b0.x - 5, b0.y - 5, (b4.x + b4.w) - b0.x + 10, b0.h + 10, 12); g.stroke();
      }
    }
  });

  /* ================= view C - Gem Cascade ================= */
  var viewC = base({
    begin: function (res, fx) {
      this.res = res; this.t = 0; this.done = false; this.fx = fx;
      this.idx = 0; this.st = 0; this.phase = 'drop';
      this.grid = res.steps[0].grid.slice();
      this.prev = null; this.clusters = []; this.mult = 1; this.run = 0;
      Audio.spinUp();
    },
    reset: function () { this.done = true; this.res = null; this.grid = null; this.clusters = []; },
    update: function (dt) {
      if (this.done) return;
      this.t += dt; this.st += dt;
      var steps = this.res.steps, i;
      if (this.phase === 'drop') {
        if (this.st >= 0.55) {
          this.st = 0; this.idx = 1;
          if (this.idx >= steps.length) { this.phase = 'end'; }
          else { this.phase = 'show'; this.clusters = steps[1].clusters; this.mult = steps[1].mult; }
        }
      } else if (this.phase === 'show') {
        if (this.st >= 0.5) {
          this.st = 0; this.phase = 'pop';
          var s = steps[this.idx];
          this.run += s.win;
          for (i = 0; i < s.clusters.length; i++) {
            var cl = s.clusters[i];
            Audio.pop(cl.cells.length - 5);
            for (var j = 0; j < cl.cells.length; j++) this.fx.burstCell(cl.cells[j], 4, GEMC[cl.tier]);
          }
          this.fx.shake(4 + Math.min(10, s.win));
        }
      } else if (this.phase === 'pop') {
        if (this.st >= 0.22) {
          this.st = 0; this.idx++;
          if (this.idx >= steps.length) { this.phase = 'end'; }
          else {
            this.prev = this.grid;
            this.grid = steps[this.idx].grid.slice();
            this.clusters = [];
            this.mult = steps[this.idx].mult;
            this.phase = 'fall';
          }
        }
      } else if (this.phase === 'fall') {
        if (this.st >= 0.3) {
          this.st = 0; this.idx++;
          if (this.idx >= steps.length) { this.phase = 'end'; }
          else { this.phase = 'show'; this.clusters = steps[this.idx].clusters; this.mult = steps[this.idx].mult; }
        }
      } else if (this.phase === 'end') {
        if (this.st > 0.35) this.done = true;
      }
    },
    geo: function (r) {
      var s = Math.min((r.w - 60) / 5, (r.h - 76) / 5);
      return { s: s, x: r.x + (r.w - s * 5) / 2, y: r.y + 46 };
    },
    draw: function (g, r) {
      panelBG(g, r);
      var go = this.geo(r), s = go.s, i, x, y;
      g.fillStyle = '#0c121b';
      D.rr(g, go.x - 5, go.y - 5, s * 5 + 10, s * 5 + 10, 10); g.fill();
      if (!this.grid) {
        D.text(g, 'TAP SPIN', r.x + r.w / 2, go.y + s * 2.5, 14, '#4d6b8a', 'center');
        return;
      }
      var inCluster = null;
      if (this.clusters && this.clusters.length) {
        inCluster = {};
        for (i = 0; i < this.clusters.length; i++)
          for (var j = 0; j < this.clusters[i].cells.length; j++) inCluster[this.clusters[i].cells[j]] = 1;
      }
      var pulse = 0.5 + 0.5 * Math.sin(this.t * 14);
      g.save();
      g.beginPath(); D.rr(g, go.x - 5, go.y - 5, s * 5 + 10, s * 5 + 10, 10); g.clip();
      for (i = 0; i < 25; i++) {
        x = go.x + (i % 5) * s + s / 2;
        y = go.y + ((i / 5) | 0) * s + s / 2;
        var dy = 0, a = 1, sc = 1;
        if (this.phase === 'drop') {
          var pd = U.clamp((this.st - (i % 5) * 0.045) / 0.34, 0, 1);
          dy = -(1 - U.easeOut(pd)) * (s * 5 + 20); a = pd > 0 ? 1 : 0;
        } else if (this.phase === 'fall') {
          var changed = !this.prev || this.prev[i] !== this.grid[i];
          if (changed) { var pf = U.clamp(this.st / 0.28, 0, 1); dy = -(1 - U.easeOut(pf)) * 90; }
        } else if (this.phase === 'pop' && inCluster && inCluster[i]) {
          continue;
        } else if (this.phase === 'show' && inCluster && inCluster[i]) {
          sc = 1 + pulse * 0.14;
          g.fillStyle = 'rgba(255,255,255,' + (0.1 + pulse * 0.18) + ')';
          D.rr(g, go.x + (i % 5) * s + 2, go.y + ((i / 5) | 0) * s + 2, s - 4, s - 4, 6); g.fill();
        }
        drawGem(g, this.grid[i], x, y + dy, s * sc * 0.92, a);
      }
      g.restore();
      g.strokeStyle = '#26364a'; g.lineWidth = 2;
      D.rr(g, go.x - 5, go.y - 5, s * 5 + 10, s * 5 + 10, 10); g.stroke();
      var mi = this.mult || 1;
      D.text(g, 'MULT x' + mi, r.x + 20, r.y + 26, 13, mi > 1 ? '#ffd76b' : '#7f93ab', 'left', '800');
      D.text(g, 'CLUSTERS 5+', r.x + r.w / 2, r.y + 26, 11, '#7f93ab', 'center');
      if (this.run > 0) D.text(g, U.mx(this.run), r.x + r.w - 20, r.y + 26, 14, '#8ef0a8', 'right', '800');
    }
  });

  /* ================= view D - Jackpot Wheel ================= */
  var viewD = base({
    angle: 0,
    begin: function (res, fx) {
      this.res = res; this.t = 0; this.done = false; this.fx = fx;
      var lay = M.D.layout, cands = [], i;
      for (i = 0; i < lay.length; i++) if (lay[i] === res.seg) cands.push(i);
      if (!cands.length) cands = [0];
      var w = cands[(Math.random() * cands.length) | 0];
      var step = Math.PI * 2 / lay.length;
      // pointer at top (-PI/2); we want wedge centre under pointer
      var want = -Math.PI / 2 - (w * step + step / 2);
      var cur = this.angle % (Math.PI * 2);
      var delta = ((want - cur) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      this.a0 = this.angle;
      this.a1 = this.angle + Math.PI * 2 * 5 + delta;
      this.dur = 3.0; this.wedge = w; this.lastTick = 0;
      Audio.spinUp();
    },
    reset: function () { this.done = true; this.res = null; },
    update: function (dt) {
      if (this.done) return;
      this.t += dt;
      var p = U.clamp(this.t / this.dur, 0, 1);
      var e = 1 - Math.pow(1 - p, 4);
      this.angle = U.lerp(this.a0, this.a1, e);
      var tick = Math.floor((this.angle) / (Math.PI * 2 / M.D.layout.length));
      if (tick !== this.lastTick) {
        this.lastTick = tick;
        if (p < 0.97) Audio.tone(700 - p * 250, 0.025, 'square', 0.05 * (1 - p * 0.7));
      }
      if (p >= 1) {
        if (this.t > this.dur + 0.45) this.done = true;
        else if (this.t - dt <= this.dur) { this.fx.shake(6); }
      }
    },
    draw: function (g, r, flash) {
      panelBG(g, r);
      var lay = M.D.layout, seg = M.D.segments;
      var cx = r.x + r.w / 2, cy = r.y + r.h / 2 + 6;
      var rad = Math.min(r.w / 2 - 30, r.h / 2 - 30);
      var step = Math.PI * 2 / lay.length;
      var cols = ['#1c2531', '#3f6b8f', '#4f8fbf', '#5fb0a0', '#7fbf5f', '#bfa73f', '#d98a3f', '#e0603c', '#d94fe0', '#ffd24d'];
      g.save(); g.translate(cx, cy); g.rotate(this.angle);
      for (var i = 0; i < lay.length; i++) {
        var s = lay[i], a0 = i * step, a1 = a0 + step;
        g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, rad, a0, a1); g.closePath();
        var hot = (this.done || this.t >= this.dur) && i === this.wedge;
        g.fillStyle = hot ? (0.5 + 0.5 * Math.sin(this.t * 16) > 0.5 ? '#fff3c4' : cols[s]) : cols[s];
        g.fill();
        g.strokeStyle = 'rgba(8,12,18,0.6)'; g.lineWidth = 1.5; g.stroke();
        if (s > 0) {
          g.save();
          g.rotate(a0 + step / 2); g.translate(rad * 0.66, 0); g.rotate(Math.PI / 2);
          var up = Math.cos(this.angle + a0 + step / 2);
          if (up < 0) g.rotate(Math.PI);
          D.text(g, s === 9 ? 'GRAND' : seg[s][0], 0, 0, s >= 8 ? 11 : 10, '#0c1119', 'center', '800');
          g.restore();
        }
      }
      g.beginPath(); g.arc(0, 0, rad * 0.24, 0, 6.284);
      g.fillStyle = '#141b26'; g.fill();
      g.strokeStyle = '#3a5170'; g.lineWidth = 3; g.stroke();
      g.restore();
      D.text(g, 'SPIN', cx, cy, 12, '#7f93ab', 'center', '800');
      // pointer
      g.fillStyle = flash > 0 ? '#ffd76b' : '#e8eef6';
      g.beginPath();
      g.moveTo(cx, cy - rad + 16); g.lineTo(cx - 11, cy - rad - 8); g.lineTo(cx + 11, cy - rad - 8);
      g.closePath(); g.fill();
      g.strokeStyle = '#0c1119'; g.lineWidth = 2; g.stroke();
    }
  });

  root.CR_VIEWS = { A: viewA, B: viewB, C: viewC, D: viewD, drawSym: drawSym, drawGem: drawGem, COL: COL, GEMC: GEMC };
})(window);
