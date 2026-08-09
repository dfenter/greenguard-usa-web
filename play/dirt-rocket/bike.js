/* Dirt Rocket - two-wheel suspension physics */
(function (g) {
  'use strict';

  var GRAV = 1700;
  var INERTIA = 1200;
  var AX = 27;          // half wheelbase (body frame)
  var AY = 6;           // axle offset below chassis centre
  var REST = 15;        // suspension rest length
  var WR = 13;          // wheel radius
  var KS = 130, CS = 13;      // suspension spring / damper
  var MU = 1.9;               // traction coefficient
  var DRIVE = 1450, BOOSTF = 1150, BRAKEF = 1500;
  var AIRDRAG = 0.0010;
  var MAXPEN = 34;

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function wrapAng(a) { while (a > Math.PI) a -= 6.283185307; while (a < -Math.PI) a += 6.283185307; return a; }

  function Bike() {
    this.reset(0, 0, 0);
  }

  Bike.prototype.reset = function (x, y, ang) {
    this.x = x; this.y = y; this.vx = 0; this.vy = 0;
    this.a = ang || 0; this.w = 0;
    this.pen = [0, 0];        // per-wheel compression (visual)
    this.grounded = [false, false];
    this.airTime = 0;
    this.heat = 0; this.lock = false;
    this.crashed = false; this.crashKind = '';
    this.wheelie = 0;         // px of wheelie this run
    this.rpm = 0;
    this.inMud = false;
    this.lastImpact = 0;
    this.flipTotal = 0;
  };

  // returns event string ('' | 'clean' | 'ok' | 'wobble' | 'crash') for this frame
  Bike.prototype.step = function (dt, tr, inp, out) {
    var subs = clamp(Math.ceil(dt / 0.004), 1, 8);
    var h = dt / subs;
    out.landed = ''; out.impact = 0; out.dust = 0; out.spark = 0;
    for (var s = 0; s < subs; s++) this.sub(h, tr, inp, out);
    return out;
  };

  Bike.prototype.sub = function (dt, tr, inp, out) {
    var ca = Math.cos(this.a), sa = Math.sin(this.a);
    // body axes (world y is DOWN): right = (ca,sa), down = (-sa, ca)
    var fx = 0, fy = GRAV, tq = 0;
    var wasAir = !this.grounded[0] && !this.grounded[1];
    var gcount = 0;
    this.inMud = false;

    // ----- boost / heat
    var boosting = false;
    if (this.lock) { if (this.heat < 0.34) this.lock = false; }
    if (inp.boost && !this.lock && inp.gas) {
      boosting = true;
      this.heat += dt * 0.44;
      if (this.heat >= 1) { this.heat = 1; this.lock = true; }
    } else {
      this.heat -= dt * (this.lock ? 0.42 : 0.32);
      if (this.heat < 0) this.heat = 0;
    }
    this.boosting = boosting;

    // ----- wheels
    for (var i = 0; i < 2; i++) {
      var ox = (i === 0 ? -AX : AX);
      // axle in world
      var axw = this.x + ox * ca + (-sa) * (AY + REST);
      var ayw = this.y + ox * sa + (ca) * (AY + REST);
      var gy = tr.heightAt(axw);
      var pen = (ayw + WR) - gy;
      this.grounded[i] = false;
      if (pen > 0) {
        pen = Math.min(pen, MAXPEN);
        var sl = tr.slopeAt(axw);
        var nx = Math.sin(sl), ny = -Math.cos(sl);   // ground normal (points up)
        var tx = Math.cos(sl), ty = Math.sin(sl);    // forward tangent
        // contact patch (forces act at the ground, not the axle)
        var rx = axw - this.x, ry = (ayw + WR - pen) - this.y;
        var pvx = this.vx - this.w * ry, pvy = this.vy + this.w * rx;
        var vn = pvx * nx + pvy * ny;
        var vt = pvx * tx + pvy * ty;

        var N = KS * pen - CS * vn * 1.0;
        if (N < 0) N = 0;
        if (N > 9000) N = 9000;
        this.pen[i] = pen;
        this.grounded[i] = true; gcount++;
        this.gslope = sl;

        var mud = tr.isMud(axw);
        if (mud) this.inMud = true;
        var grip = MU * (mud ? 0.62 : 1) * N;

        var ftx = 0;
        // drive (rear only)
        if (i === 0 && inp.gas) {
          ftx += DRIVE * (1 - clamp(Math.abs(vt) / 1400, 0, 0.88));
        }
        // brake
        if (inp.brake) {
          var bf = BRAKEF * (i === 0 ? 0.45 : 0.55);
          ftx -= clamp(vt * 40, -bf, bf);
        }
        // rolling resistance + mud drag
        ftx -= vt * (mud ? 1.35 : 0.16);
        // clamp by traction
        ftx = clamp(ftx, -grip, grip);

        fx += N * nx + ftx * tx;
        fy += N * ny + ftx * ty;
        tq += rx * (N * ny + ftx * ty) - ry * (N * nx + ftx * tx);

        // impact bookkeeping
        if (wasAir) {
          var diff = Math.abs(wrapAng(this.a - sl));
          var vimp = Math.abs(vn);
          out.impact = Math.max(out.impact, vimp);
          if (diff > 1.05 || (vimp > 1250 && diff > 0.42)) {
            this.crash('faceplant'); out.landed = 'crash';
          } else if (diff > 0.60) {
            this.vx *= 0.62; this.vy *= 0.5; this.w *= 0.4; out.landed = 'wobble';
          } else if (diff < 0.24 && vimp > 160) {
            var sp = Math.hypot(this.vx, this.vy);
            var bl = Math.min(70, 40 + vimp * 0.05);
            this.vx += tx * bl; this.vy += ty * bl;
            out.landed = 'clean';
          } else if (vimp > 120) {
            out.landed = out.landed || 'ok';
          }
          this.flipTotal = 0;
        }
      } else {
        this.pen[i] *= 0.85;
      }
    }

    // ----- boost thrust: pushes through the frame, not the tyre (no loop-out torque)
    if (boosting) {
      var bf2 = BOOSTF * (gcount > 0 ? 1 : 0.55);
      fx += ca * bf2; fy += sa * bf2;
    }

    // ----- rider lean / pitch
    var lean = inp.lean;
    if (gcount > 0) {
      // anti-loop: authority fades as the nose climbs past ~35 degrees
      var fade = lean > 0 ? 1 - 0.85 * clamp((-this.a - 0.6) / 0.85, 0, 1) : 1;
      tq -= lean * 12000 * fade;
      // upright-ish assist so it is controllable
      this.w *= (1 - 3.2 * dt);
    } else {
      tq -= lean * 7000;
      this.w *= (1 - 2.4 * dt);
      this.airTime += dt;
      this.flipTotal += Math.abs(this.w) * dt;
    }
    if (gcount > 0) this.airTime = 0;

    // ----- air drag
    var sp2 = Math.hypot(this.vx, this.vy);
    fx -= this.vx * sp2 * AIRDRAG;
    fy -= this.vy * sp2 * AIRDRAG;

    // ----- integrate
    this.vx += fx * dt; this.vy += fy * dt;
    this.w += (tq / INERTIA) * dt;
    this.w = clamp(this.w, -7, 7);
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.a = wrapAng(this.a + this.w * dt);

    // ----- ground pitch limits: a wheel on the dirt cannot loop or endo past the stops
    if (gcount > 0) {
      var gs = this.gslope || 0;
      var lo = gs - 1.02, hi = gs + 0.95;
      if (this.a < lo) { this.a = lo; if (this.w < 0) this.w *= -0.15; }
      else if (this.a > hi) { this.a = hi; if (this.w > 0) this.w *= -0.15; }
    }

    // ----- wheelie credit (rear down, front up, nose raised)
    if (this.grounded[0] && !this.grounded[1] && this.a < -0.22 && this.vx > 60) {
      this.wheelie += this.vx * dt;
      out.dust += 1;
    }
    if (this.grounded[0] && inp.gas) out.dust += 1;

    this.rpm = clamp(Math.abs(this.vx) / 900, 0, 1);

    // ----- chassis / rider hitting dirt = crash
    if (!this.crashed) {
      var pts = [[-17, -7], [17, -7], [0, -24], [0, -6]];
      for (var k = 0; k < pts.length; k++) {
        var px = this.x + pts[k][0] * ca + (-sa) * pts[k][1];
        var py = this.y + pts[k][0] * sa + (ca) * pts[k][1];
        if (py > tr.heightAt(px) - 1) { this.crash('slam'); out.landed = 'crash'; break; }
      }
      if (Math.abs(this.a) > 2.05) { this.crash('flip'); out.landed = 'crash'; }
    }
  };

  Bike.prototype.crash = function (kind) {
    if (this.crashed) return;
    this.crashed = true; this.crashKind = kind;
  };

  g.DR = g.DR || {};
  g.DR.Bike = Bike;
  g.DR.BK = { AX: AX, AY: AY, REST: REST, WR: WR };
})(window);
