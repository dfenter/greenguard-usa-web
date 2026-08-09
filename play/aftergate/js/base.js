/* Aftergate - BASE phase: garrison the wall, hold 10 waves. */
'use strict';

var WALL_Y = 636, WALL_H = 54, FIELD_TOP = 82;
var MAX_ENEM = 46, MAX_SHOT = 70;

var ROLES = {
  spear: { name: 'SPEAR', cost: 11, range: 150, dps: 36, cd: 0.55, col: '#3fd18a', splash: 0 },
  bow: { name: 'BOW', cost: 16, range: 340, dps: 19, cd: 0.75, col: '#5aa9ff', splash: 0 },
  oil: { name: 'OIL', cost: 26, range: 190, dps: 30, cd: 1.25, col: '#ffa04d', splash: 66 }
};
var ROLE_KEYS = ['spear', 'bow', 'oil'];

var ETYPES = {
  grunt: { hp: 24, spd: 34, dmg: 10, w: 20, h: 26, col: '#c04450' },
  runner: { hp: 14, spd: 64, dmg: 6, w: 16, h: 22, col: '#d98ac0' },
  brute: { hp: 68, spd: 22, dmg: 22, w: 30, h: 34, col: '#8f5bd6' }
};

var Base = {
  slots: [], enem: [], shots: [], roleBtns: [], readyBtn: null,
  troops: 0, wallHP: 120, wallMax: 120, wave: 0, phase: 'build',
  sel: 'spear', result: null, spawnQ: [], spawnT: 0, cursor: 0, kbd: false,
  hint: 0, dragId: null, dragPos: null, banner: '', bannerT: 0, cleared: 0,

  init: function (troops) {
    this.slots.length = 0; this.enem.length = 0; this.shots.length = 0; this.spawnQ.length = 0;
    this.troops = troops; this.wallMax = 150; this.wallHP = 150; this.wave = 1;
    this.phase = 'build'; this.sel = 'spear'; this.result = null; this.cleared = 0;
    this.spawnT = 0; this.cursor = 0; this.kbd = false; this.hint = 1;
    this.dragId = null; this.dragPos = null; this.banner = 'WAVE 1'; this.bannerT = 1.6;
    var i, sw = 88, gap = 8, x0 = (DW - (5 * sw + 4 * gap)) / 2;
    for (var row = 0; row < 2; row++) {
      for (i = 0; i < 5; i++) {
        this.slots.push({
          x: x0 + i * (sw + gap), y: row === 0 ? WALL_Y + 2 : WALL_Y + 84,
          w: sw, h: 76, col: i, row: row, role: null, lvl: 0, cd: 0, fire: 0
        });
      }
    }
    var bw = 164, bx = (DW - (3 * bw + 2 * 10)) / 2;
    this.roleBtns.length = 0;
    for (i = 0; i < 3; i++) this.roleBtns.push({ x: bx + i * (bw + 10), y: 800, w: bw, h: 74, role: ROLE_KEYS[i] });
    this.readyBtn = { x: 14, y: 880, w: DW - 28, h: 72 };
  },

  colX: function (c) { var s = this.slots[c]; return s.x + s.w / 2; },

  /* -------- input -------- */
  handleInput: function () {
    var i, r, rel;
    // drag ghost tracking (own pointerId)
    if (this.dragId !== null) {
      var p = Input.ptr[this.dragId];
      if (p) this.dragPos = { x: p.x, y: p.y };
    }
    var ps = Input.list();
    for (i = 0; i < ps.length; i++) {
      if (this.dragId === null) {
        for (r = 0; r < this.roleBtns.length; r++) {
          var b = this.roleBtns[r];
          if (ps[i].startX >= b.x && ps[i].startX <= b.x + b.w && ps[i].startY >= b.y && ps[i].startY <= b.y + b.h) {
            this.dragId = ps[i].id; this.sel = b.role; this.kbd = false;
            this.dragPos = { x: ps[i].x, y: ps[i].y };
            break;
          }
        }
      }
      ps[i].dx = 0; ps[i].dy = 0;
    }

    while (Input.releases.length) {
      rel = Input.releases.shift();
      if (rel.id === this.dragId) { this.dragId = null; this.dragPos = null; }
      if (rel.cancelled) continue;
      this.tapAt(rel.x, rel.y, rel.startX, rel.startY);
    }
    Input.clearTaps();
  },

  tapAt: function (x, y, sx, sy) {
    var i, b;
    // role buttons (only when press started there, or a plain tap)
    for (i = 0; i < this.roleBtns.length; i++) {
      b = this.roleBtns[i];
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h &&
        sx >= b.x && sx <= b.x + b.w && sy >= b.y && sy <= b.y + b.h) {
        this.sel = b.role; this.kbd = false; Sfx.shoot(); return;
      }
    }
    b = this.readyBtn;
    if (this.phase === 'build' && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { this.startWave(); return; }
    for (i = 0; i < this.slots.length; i++) {
      var s = this.slots[i];
      if (x >= s.x - 4 && x <= s.x + s.w + 4 && y >= s.y - 4 && y <= s.y + s.h + 4) {
        this.cursor = i; this.place(i); return;
      }
    }
  },

  place: function (idx) {
    var s = this.slots[idx], role = this.sel, def = ROLES[role];
    var cost, up = false;
    if (s.role === null) cost = def.cost;
    else if (s.role === role && s.lvl < 3) { cost = Math.round(ROLES[role].cost * (s.lvl + 1) * 1.4); up = true; }
    else if (s.role !== role) { Sfx.bad(); Fx.pop(s.x + s.w / 2, s.y - 10, 'OCCUPIED', '#ff6b6b'); return; }
    else { Sfx.bad(); Fx.pop(s.x + s.w / 2, s.y - 10, 'MAX', '#ffd479'); return; }
    if (this.troops < cost) {
      Sfx.bad(); Fx.pop(s.x + s.w / 2, s.y - 10, 'NEED ' + cost, '#ff6b6b'); return;
    }
    this.troops -= cost;
    if (up) s.lvl++; else { s.role = role; s.lvl = 1; }
    Sfx.place();
    Fx.burst(s.x + s.w / 2, s.y + s.h / 2, 12, def.col, 190);
    Fx.pop(s.x + s.w / 2, s.y - 6, up ? 'LV' + s.lvl : def.name, def.col);
  },

  startWave: function () {
    if (this.phase !== 'build') return;
    this.phase = 'fight';
    this.spawnQ.length = 0;
    var w = this.wave, n = 5 + w * 3, i;
    var hpS = 1 + (w - 1) * 0.56;
    for (i = 0; i < n; i++) {
      var t = 'grunt';
      var r = Math.random();
      if (w >= 3 && r < 0.30) t = 'brute';
      else if (w >= 2 && r < 0.58) t = 'runner';
      this.spawnQ.push({ t: t, col: rndi(0, 4), hpS: hpS });
    }
    if (this.spawnQ.length > 40) this.spawnQ.length = 40;
    this.spawnT = 0.3;
    this.banner = 'WAVE ' + w + ' — INCOMING'; this.bannerT = 1.4;
    Sfx.wave();
  },

  // damage per shot = sustained dps * cooldown, so listed dps is honest
  dmgOf: function (s) { var d = ROLES[s.role]; return d.dps * d.cd * (1 + (s.lvl - 1) * 0.7); },

  /* -------- update -------- */
  update: function (dt) {
    if (this.result) return;
    this.bannerT = Math.max(0, this.bannerT - dt);
    this.handleInput();

    var i, j, e, s;

    if (this.phase === 'fight') {
      // spawn
      if (this.spawnQ.length) {
        this.spawnT -= dt;
        if (this.spawnT <= 0) {
          this.spawnT = Math.max(0.22, 0.62 - this.wave * 0.03);
          var q = this.spawnQ.shift(), b = ETYPES[q.t];
          if (this.enem.length < MAX_ENEM) {
            this.enem.push({
              t: q.t, x: this.colX(q.col) + rnd(-16, 16), y: FIELD_TOP - rnd(10, 90),
              hp: b.hp * q.hpS, max: b.hp * q.hpS, spd: b.spd, dmg: b.dmg,
              w: b.w, h: b.h, col: b.col, atk: 0, flash: 0
            });
          }
        }
      }
      // enemies
      for (i = this.enem.length - 1; i >= 0; i--) {
        e = this.enem[i];
        e.flash = Math.max(0, e.flash - dt * 4);
        if (e.y < WALL_Y - 14) e.y += e.spd * dt;
        else {
          e.atk -= dt;
          if (e.atk <= 0) {
            e.atk = 0.9;
            this.wallHP -= e.dmg;
            Fx.burst(e.x, WALL_Y + 6, 6, '#ff6b6b', 160);
            Fx.kick(5); Sfx.thud();
            if (this.wallHP <= 0) { this.wallHP = 0; this.lose(); return; }
          }
        }
        if (e.hp <= 0) {
          Fx.burst(e.x, e.y, 12, e.col, 220);
          this.enem.splice(i, 1);
        }
      }
      // defenders
      for (i = 0; i < this.slots.length; i++) {
        s = this.slots[i];
        s.fire = Math.max(0, s.fire - dt * 5);
        if (!s.role) continue;
        s.cd -= dt;
        if (s.cd > 0) continue;
        var def = ROLES[s.role], cx = s.x + s.w / 2, cy = s.y + s.h / 2;
        var best = null, bd = 1e9;
        for (j = 0; j < this.enem.length; j++) {
          e = this.enem[j];
          var dx = e.x - cx, dy = e.y - cy, d = Math.sqrt(dx * dx + dy * dy);
          if (d <= def.range && d < bd) { bd = d; best = e; }
        }
        if (!best) continue;
        s.cd = def.cd; s.fire = 1;
        if (this.shots.length < MAX_SHOT) {
          this.shots.push({
            x: cx, y: cy - 20, tx: best.x, ty: best.y, t: 0,
            dur: s.role === 'spear' ? 0.09 : 0.2, dmg: this.dmgOf(s),
            splash: def.splash, col: def.col
          });
        }
        Sfx.shoot();
      }
      // shots resolve
      for (i = this.shots.length - 1; i >= 0; i--) {
        var sh = this.shots[i]; sh.t += dt;
        if (sh.t < sh.dur) continue;
        this.shots.splice(i, 1);
        if (sh.splash) {
          Fx.burst(sh.tx, sh.ty, 10, sh.col, 200);
          for (j = 0; j < this.enem.length; j++) {
            e = this.enem[j];
            var ddx = e.x - sh.tx, ddy = e.y - sh.ty;
            if (ddx * ddx + ddy * ddy <= sh.splash * sh.splash) { e.hp -= sh.dmg; e.flash = 1; }
          }
        } else {
          var hit = null, hd = 1e9;
          for (j = 0; j < this.enem.length; j++) {
            e = this.enem[j];
            var qx = e.x - sh.tx, qy = e.y - sh.ty, q2 = qx * qx + qy * qy;
            if (q2 < hd) { hd = q2; hit = e; }
          }
          if (hit && hd < 3600) { hit.hp -= sh.dmg; hit.flash = 1; Fx.burst(hit.x, hit.y, 4, sh.col, 130); }
        }
      }
      // wave cleared?
      if (!this.spawnQ.length && !this.enem.length) this.clearWave();
    }

    if (this.shots.length > MAX_SHOT) this.shots.splice(0, this.shots.length - MAX_SHOT);
    if (this.enem.length > MAX_ENEM) this.enem.splice(0, this.enem.length - MAX_ENEM);
  },

  clearWave: function () {
    this.cleared = this.wave;
    if (this.wave >= 10) { this.win(); return; }
    var reward = 6 + this.wave * 4;
    this.troops += reward;
    var rep = Math.min(30, this.wallMax - this.wallHP);
    this.wallHP += rep;
    this.wave++;
    this.phase = 'build';
    this.banner = 'HELD — +' + reward + ' TROOPS' + (rep > 0 ? ' +' + rep + ' WALL' : '');
    this.bannerT = 2.2;
    Fx.bang('#7ee0a8', 0.3);
    Sfx.good();
  },
  win: function () { this.result = 'win'; this.phase = 'done'; Fx.bang('#7ee0a8', 0.7); Sfx.win(); },
  lose: function () { this.result = 'lose'; this.phase = 'done'; Fx.kick(18); Fx.bang('#ff3b3b', 0.7); Sfx.lose(); },

  key: function (k) {
    this.kbd = true;
    if (k === 'ArrowLeft') this.cursor = (this.cursor + 9) % 10;
    else if (k === 'ArrowRight') this.cursor = (this.cursor + 1) % 10;
    else if (k === 'ArrowUp') this.cursor = (this.cursor + 5) % 10;
    else if (k === 'ArrowDown') this.cursor = (this.cursor + 5) % 10;
    else if (k === 'Tab' || k === 'q' || k === 'Q') this.sel = ROLE_KEYS[(ROLE_KEYS.indexOf(this.sel) + 1) % 3];
    else if (k === '1') this.sel = 'spear';
    else if (k === '2') this.sel = 'bow';
    else if (k === '3') this.sel = 'oil';
    else if (k === ' ') this.place(this.cursor);
    else if (k === 'Enter') this.startWave();
  },

  /* -------- draw -------- */
  draw: function (g) {
    var i, s, e;
    g.fillStyle = '#141821'; g.fillRect(0, 0, DW, DH);
    // field
    g.fillStyle = '#1b212c'; g.fillRect(0, FIELD_TOP, DW, WALL_Y - FIELD_TOP);
    g.fillStyle = 'rgba(255,255,255,.03)';
    for (i = 0; i < 5; i++) g.fillRect(this.colX(i) - 44, FIELD_TOP, 88, WALL_Y - FIELD_TOP);
    g.strokeStyle = 'rgba(255,255,255,.05)'; g.lineWidth = 2;
    for (i = FIELD_TOP; i < WALL_Y; i += 60) { g.beginPath(); g.moveTo(0, i); g.lineTo(DW, i); g.stroke(); }

    // range preview of selected during build
    if (this.phase === 'build') {
      var cs = this.slots[this.cursor];
      var pr = ROLES[this.sel];
      g.strokeStyle = pr.col; g.globalAlpha = 0.28; g.lineWidth = 3;
      g.beginPath(); g.arc(cs.x + cs.w / 2, cs.y + cs.h / 2, pr.range, 0, 6.284); g.stroke();
      g.globalAlpha = 1;
    }

    // enemies
    for (i = 0; i < this.enem.length; i++) {
      e = this.enem[i];
      g.fillStyle = e.flash > 0 ? '#ffffff' : e.col;
      g.fillRect(e.x - e.w / 2, e.y - e.h / 2, e.w, e.h);
      g.fillStyle = e.flash > 0 ? '#ffffff' : 'rgba(255,255,255,.35)';
      g.fillRect(e.x - e.w / 4, e.y - e.h / 2 - 8, e.w / 2, 8);
      if (e.hp < e.max) {
        g.fillStyle = '#0b0d12'; g.fillRect(e.x - e.w / 2, e.y - e.h / 2 - 16, e.w, 5);
        g.fillStyle = '#ff6b6b'; g.fillRect(e.x - e.w / 2, e.y - e.h / 2 - 16, e.w * clamp(e.hp / e.max, 0, 1), 5);
      }
    }

    // shots
    for (i = 0; i < this.shots.length; i++) {
      var sh = this.shots[i], t = clamp(sh.t / sh.dur, 0, 1);
      g.strokeStyle = sh.col; g.globalAlpha = 0.85;
      g.lineWidth = sh.splash ? 6 : 3;
      g.beginPath(); g.moveTo(sh.x, sh.y);
      g.lineTo(lerp(sh.x, sh.tx, t), lerp(sh.y, sh.ty, t)); g.stroke();
      g.globalAlpha = 1;
    }

    // wall
    g.fillStyle = '#39404f'; g.fillRect(0, WALL_Y - 12, DW, WALL_H);
    g.fillStyle = '#4a5568';
    for (i = 0; i < 18; i++) g.fillRect(i * 30 + ((i % 2) ? 0 : 6), WALL_Y - 12, 24, 16);
    g.fillStyle = '#0b0d12'; g.fillRect(10, WALL_Y + 20, DW - 20, 14);
    var hpf = clamp(this.wallHP / this.wallMax, 0, 1);
    g.fillStyle = hpf > 0.5 ? '#7ee0a8' : (hpf > 0.22 ? '#ffd479' : '#ff6b6b');
    g.fillRect(12, WALL_Y + 22, (DW - 24) * hpf, 10);

    // slots
    for (i = 0; i < this.slots.length; i++) {
      s = this.slots[i];
      var isCur = (i === this.cursor && this.phase === 'build');
      g.fillStyle = s.role ? 'rgba(30,40,55,.95)' : 'rgba(24,29,39,.85)';
      rr(g, s.x, s.y, s.w, s.h, 9); g.fill();
      g.lineWidth = isCur ? 4 : 2;
      g.strokeStyle = isCur ? '#ffd479' : (s.role ? ROLES[s.role].col : '#3a4557');
      rr(g, s.x, s.y, s.w, s.h, 9); g.stroke();
      if (s.role) {
        var d = ROLES[s.role], cx = s.x + s.w / 2, cy = s.y + s.h / 2;
        g.fillStyle = s.fire > 0 ? '#ffffff' : d.col;
        g.fillRect(cx - 9, cy - 12, 18, 22);
        g.fillStyle = s.fire > 0 ? '#ffffff' : 'rgba(255,255,255,.55)';
        g.fillRect(cx - 6, cy - 22, 12, 10);
        txt(g, d.name.charAt(0) + s.lvl, cx, s.y + s.h - 12, 16, d.col);
      } else {
        txt(g, '+', s.x + s.w / 2, s.y + s.h / 2, 30, '#3a4557');
      }
    }

    // role tray
    for (i = 0; i < this.roleBtns.length; i++) {
      var b = this.roleBtns[i], d = ROLES[b.role], on = this.sel === b.role;
      var afford = this.troops >= d.cost;
      g.fillStyle = on ? 'rgba(40,58,80,.98)' : 'rgba(22,28,38,.95)';
      rr(g, b.x, b.y, b.w, b.h, 10); g.fill();
      g.lineWidth = on ? 4 : 2; g.strokeStyle = on ? d.col : '#3a4557';
      rr(g, b.x, b.y, b.w, b.h, 10); g.stroke();
      g.globalAlpha = afford ? 1 : 0.45;
      txt(g, d.name, b.x + b.w / 2, b.y + 26, 21, d.col);
      txt(g, d.cost + ' troops', b.x + b.w / 2, b.y + 52, 15, '#9fb0c6');
      g.globalAlpha = 1;
    }

    // ready button / fight status
    var rb = this.readyBtn;
    if (this.phase === 'build') {
      g.fillStyle = 'rgba(30,62,44,.98)'; rr(g, rb.x, rb.y, rb.w, rb.h, 12); g.fill();
      g.lineWidth = 3; g.strokeStyle = '#3fd18a'; rr(g, rb.x, rb.y, rb.w, rb.h, 12); g.stroke();
      txt(g, 'START WAVE ' + this.wave + '  ▶', rb.x + rb.w / 2, rb.y + rb.h / 2, 24, '#a9f5cd');
    } else {
      g.fillStyle = 'rgba(22,28,38,.9)'; rr(g, rb.x, rb.y, rb.w, rb.h, 12); g.fill();
      txt(g, 'WAVE ' + this.wave + ' — ' + (this.spawnQ.length + this.enem.length) + ' LEFT',
        rb.x + rb.w / 2, rb.y + rb.h / 2, 22, '#9fb0c6');
    }

    // drag ghost
    if (this.dragPos) {
      var dd = ROLES[this.sel];
      g.globalAlpha = 0.8; g.fillStyle = dd.col;
      g.fillRect(this.dragPos.x - 11, this.dragPos.y - 14, 22, 28);
      g.globalAlpha = 1;
    }

    // HUD
    g.fillStyle = 'rgba(8,10,15,.9)'; g.fillRect(0, 0, DW, FIELD_TOP);
    txtO(g, 'WAVE ' + this.wave + '/10', 18, 28, 26, '#e8edf5', 'left');
    txtO(g, 'TROOPS ' + this.troops, DW - 18, 28, 26, '#8fd0ff', 'right');
    txtO(g, 'WALL ' + Math.ceil(this.wallHP), 18, 60, 19, '#9fb0c6', 'left');
    txtO(g, 'BEST ' + Game.best + ' WAVES', DW - 18, 60, 19, '#9fb0c6', 'right');

    if (this.bannerT > 0) {
      g.globalAlpha = Math.min(1, this.bannerT * 1.4);
      txtO(g, this.banner, DW / 2, 200, 30, '#ffd479');
      g.globalAlpha = 1;
    }
    if (this.wave === 1 && this.phase === 'build') {
      txtO(g, 'TAP A ROLE, THEN A SLOT — THEN START THE WAVE', DW / 2, 300, 17, '#ffd479');
    }
  }
};
