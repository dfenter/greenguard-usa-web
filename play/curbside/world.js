'use strict';
/* Curbside - world: procedural street generation + terrain queries */

var World = {
  segs: [],      // {x0,y0,x1,y1,k}  k: street|stair|ledge|rail|ramp|roof
  obs: [],       // {x,y,w,h,k}      crash boxes (hydrant, ledge face, cone)
  cars: [],      // {x,y,w,h,vx}     y = roof top
  props: [],     // decorative {x,y,k}
  gx: 0, gy: 0,
  lastKind: '',
  seedDist: 0,

  reset: function () {
    this.segs.length = 0; this.obs.length = 0; this.cars.length = 0; this.props.length = 0;
    this.gx = -600; this.gy = 0; this.lastKind = '';
    this.flat(1500);
  },

  seg: function (x0, y0, x1, y1, k) { this.segs.push({ x0: x0, y0: y0, x1: x1, y1: y1, k: k }); },

  flat: function (len) {
    this.seg(this.gx, this.gy, this.gx + len, this.gy, 'street');
    this.gx += len;
  },

  /* ---- features ---- */
  fStairs: function (d) {
    var n = irnd(4, 5 + Math.round(d * 5)), sw = 30, sh = 15;
    var x0 = this.gx, y0 = this.gy;
    for (var i = 0; i < n; i++) {
      this.seg(this.gx, this.gy, this.gx + sw, this.gy, 'stair');
      this.gx += sw; this.gy += sh;
    }
    // hand rail beside the set (grindable, sloped)
    if (Math.random() < 0.75) {
      this.seg(x0 - 16, y0 - 44, this.gx + 26, this.gy - 44, 'rail');
    }
    this.flat(rnd(150, 240));
  },
  fGap: function (d) {
    this.gx += rnd(70, 100 + d * 80);
    this.flat(rnd(200, 330));
  },
  fRail: function (d) {
    var len = rnd(150, 240 + d * 90), x0 = this.gx;
    this.seg(x0, this.gy, x0 + len + 90, this.gy, 'street');
    this.seg(x0, this.gy - 46, x0 + len, this.gy - 46, 'rail');
    this.gx += len + 90;
    this.flat(rnd(140, 220));
  },
  fLedge: function (d) {
    var len = rnd(140, 220 + d * 80), h = 36, x0 = this.gx;
    this.seg(x0, this.gy, x0 + len + 70, this.gy, 'street');
    this.seg(x0, this.gy - h, x0 + len, this.gy - h, 'ledge');
    this.obs.push({ x: x0, y: this.gy - h, w: 11, h: h, k: 'face' });
    this.gx += len + 70;
    this.flat(rnd(150, 240));
  },
  fHydrant: function () {
    this.seg(this.gx, this.gy, this.gx + 300, this.gy, 'street');
    this.obs.push({ x: this.gx + 130, y: this.gy - 27, w: 15, h: 27, k: 'hydrant' });
    this.gx += 300;
    this.flat(rnd(120, 200));
  },
  fCone: function () {
    this.seg(this.gx, this.gy, this.gx + 260, this.gy, 'street');
    var n = irnd(1, 3);
    for (var i = 0; i < n; i++) this.obs.push({ x: this.gx + 90 + i * 40, y: this.gy - 22, w: 14, h: 22, k: 'cone' });
    this.gx += 260;
    this.flat(rnd(120, 190));
  },
  fCar: function (d) {
    this.seg(this.gx, this.gy, this.gx + 420, this.gy, 'street');
    var moving = Math.random() < 0.45;
    this.cars.push({
      x: this.gx + 150, y: this.gy - 52, w: 120, h: 52,
      vx: moving ? -rnd(50, 110) : 0, hue: pick([8, 42, 190, 320, 265])
    });
    this.gx += 420;
    this.flat(rnd(130, 200));
  },
  fRamp: function () {
    var len = 130, rise = 42;
    this.seg(this.gx, this.gy, this.gx + len, this.gy - rise, 'ramp');
    this.gx += len; this.gy -= rise;
    this.flat(rnd(180, 300));
  },
  fDrop: function () { // curb drop
    this.gy += 26;
    this.flat(rnd(220, 340));
  },

  gen: function (aheadX, dist) {
    var d = clamp(dist / 3000, 0, 1);
    var guard = 0;
    while (this.gx < aheadX && guard++ < 40) {
      // keep the street from wandering off the bottom of the world
      if (this.gy > 520) { this.fRamp(); this.lastKind = 'ramp'; continue; }
      if (this.gy < -260) { this.fDrop(); this.lastKind = 'drop'; continue; }

      var bag = ['rail', 'ledge', 'stairs', 'gap', 'hydrant', 'car', 'cone', 'flat'];
      if (d > 0.25) bag.push('rail', 'stairs', 'gap');
      if (d > 0.5) bag.push('ledge', 'car', 'gap', 'stairs');
      var k = pick(bag);
      if (k === this.lastKind && Math.random() < 0.7) k = 'flat';
      this.lastKind = k;
      if (k === 'rail') this.fRail(d);
      else if (k === 'ledge') this.fLedge(d);
      else if (k === 'stairs') this.fStairs(d);
      else if (k === 'gap') this.fGap(d);
      else if (k === 'hydrant') this.fHydrant();
      else if (k === 'cone') this.fCone();
      else if (k === 'car') this.fCar(d);
      else this.flat(rnd(200, 380));
      if (Math.random() < 0.22) { this.props.push({ x: this.gx - rnd(40, 160), y: this.gy, k: pick(['hyd', 'post', 'trash']) }); }
    }
  },

  prune: function (x) {
    var i;
    for (i = this.segs.length - 1; i >= 0; i--) if (this.segs[i].x1 < x) this.segs.splice(i, 1);
    for (i = this.obs.length - 1; i >= 0; i--) if (this.obs[i].x + this.obs[i].w < x) this.obs.splice(i, 1);
    for (i = this.cars.length - 1; i >= 0; i--) if (this.cars[i].x + this.cars[i].w < x) this.cars.splice(i, 1);
    for (i = this.props.length - 1; i >= 0; i--) if (this.props[i].x < x) this.props.splice(i, 1);
  },

  update: function (dt) {
    for (var i = 0; i < this.cars.length; i++) { var c = this.cars[i]; if (c.vx) c.x += c.vx * dt; }
  },

  segY: function (s, x) {
    if (s.y0 === s.y1) return s.y0;
    return s.y0 + (s.y1 - s.y0) * ((x - s.x0) / (s.x1 - s.x0));
  },

  // every walkable surface height at x -> array of {y, seg}
  surfaces: function (x, out) {
    out.length = 0;
    for (var i = 0; i < this.segs.length; i++) {
      var s = this.segs[i];
      if (x >= s.x0 && x <= s.x1) out.push({ y: this.segY(s, x), s: s });
    }
    for (var j = 0; j < this.cars.length; j++) {
      var c = this.cars[j];
      if (x >= c.x + 6 && x <= c.x + c.w - 6) out.push({ y: c.y, s: { k: 'roof', x0: c.x, x1: c.x + c.w, car: c } });
    }
    return out;
  }
};
