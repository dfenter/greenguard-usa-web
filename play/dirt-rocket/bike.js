/* Dirt Rocket fixed-step suspension bike. World: x right, y up, z lane depth. */
const PI2 = Math.PI * 2;
const G = 23.5;
const WB = 1.82;
const AXLE_Y = -0.31;
const WR = 0.34;
const SPRING = 1200;
const DAMP = 54;
const MASS = 4.2;
const INERTIA = 5.2;

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function wrap(a) { while (a > Math.PI) a -= PI2; while (a < -Math.PI) a += PI2; return a; }

export const BIKE = { WB, AXLE_Y, WR, SPRING, DAMP };

export class Bike {
  constructor() { this.reset(0, 1, 0); }

  reset(x, y, angle = 0, preserveHealth = false) {
    const health = this.health;
    this.x = x; this.y = y; this.vx = 0; this.vy = 0; this.angle = angle; this.angular = 0;
    this.pen = [0, 0]; this.grounded = [false, false]; this.contactV = [0, 0];
    this.heat = 0.12; this.overheated = false; this.boosting = false; this.rpm = 0.12;
    this.wheelieMeter = 0; this.wheelieDistance = 0; this.airTime = 0; this.airHeight = 0;
    this.airRotation = 0; this.maxAirHeight = 0; this.crashed = false; this.crashKind = '';
    this.health = preserveHealth ? clamp(health == null ? 1 : health, 0, 1) : 1; this.lastLanding = 'READY'; this.spin = 0; this.speedKick = 0;
  }

  wheel(i) {
    const c = Math.cos(this.angle), s = Math.sin(this.angle);
    const ox = i === 0 ? -WB * 0.5 : WB * 0.5;
    const oy = AXLE_Y + this.pen[i] * 0.28;
    return { x: this.x + ox * c - oy * s, y: this.y + ox * s + oy * c };
  }

  step(dt, track, input, out) {
    out.landed = ''; out.impact = 0; out.dust = 0; out.boostStarted = false; out.noseRisk = false;
    out.landingAngle = Math.abs(wrap(this.angle - track.slopeAt(this.x)));
    const wasGrounded = this.grounded[0] || this.grounded[1];
    const wasAir = !wasGrounded;
    const oldAirHeight = this.y;
    let forceX = 0;
    let forceY = -G * MASS;
    let torque = 0;
    let contacts = 0;
    let groundSlope = track.slopeAt(this.x);
    this.grounded[0] = false; this.grounded[1] = false;
    this.contactV[0] = 0; this.contactV[1] = 0;

    // Heat is a resource, not a cooldown timer. Clean landings buy a visible
    // chunk of cooldown, while redline lockout remains telegraphed.
    const canBoost = !this.overheated && this.heat < 0.985;
    this.boosting = !!(input.boost && input.gas && canBoost);
    if (this.boosting) {
      this.heat += dt * 0.54;
      if (this.heat >= 1) { this.heat = 1; this.overheated = true; }
    } else {
      this.heat = Math.max(0, this.heat - dt * (this.overheated ? 0.48 : 0.27));
      if (this.overheated && this.heat <= 0.28) this.overheated = false;
    }

    const c = Math.cos(this.angle), s = Math.sin(this.angle);
    const tangentFor = (sl) => ({ x: Math.cos(sl), y: Math.sin(sl), nx: -Math.sin(sl), ny: Math.cos(sl) });
    for (let i = 0; i < 2; i++) {
      const ox = i === 0 ? -WB * 0.5 : WB * 0.5;
      const rawX = this.x + ox * c - AXLE_Y * s;
      const rawY = this.y + ox * s + AXLE_Y * c;
      const ground = track.heightAt(rawX);
      const penetration = ground - (rawY - WR);
      this.pen[i] = penetration > 0 ? clamp(penetration, 0, 0.58) : Math.max(0, this.pen[i] * 0.82 - dt * 0.1);
      if (penetration <= 0) continue;
      const sl = track.slopeAt(rawX);
      groundSlope = sl;
      const t = tangentFor(sl);
      const contactY = rawY + this.pen[i] * 0.28 - WR;
      const rx = rawX - this.x;
      const ry = contactY - this.y;
      const pvx = this.vx - this.angular * ry;
      const pvy = this.vy + this.angular * rx;
      const vn = pvx * t.nx + pvy * t.ny;
      const vt = pvx * t.x + pvy * t.y;
      let normal = SPRING * this.pen[i] - DAMP * vn;
      normal = clamp(normal, 0, 2600);
      const mudGrip = track.familyId === 'dunes' ? 0.93 : 1;
      let drive = 0;
      if (i === 0 && input.gas) drive += 12.6 * (1 - clamp(Math.abs(vt) / 33, 0, 0.78));
      if (this.boosting) drive += i === 0 ? 13.0 : 2.0;
      if (input.brake) drive -= clamp(vt * 9.5, -11, 11) * (i === 0 ? 0.46 : 0.72);
      drive -= vt * (track.familyId === 'dunes' ? 0.34 : 0.20);
      drive = clamp(drive, -normal * 0.92 * mudGrip, normal * 0.92 * mudGrip);
      forceX += normal * t.nx + drive * t.x;
      forceY += normal * t.ny + drive * t.y;
      torque += rx * (normal * t.ny + drive * t.y) - ry * (normal * t.nx + drive * t.x);
      this.grounded[i] = true; this.contactV[i] = vn; contacts++;

      if (wasAir) {
        const angle = Math.abs(wrap(this.angle - sl));
        const impact = Math.abs(vn);
        out.impact = Math.max(out.impact, impact);
        out.landingAngle = angle;
        if (i === 1 && angle > 0.48) out.noseRisk = true;
        if (angle > 0.98 || (i === 1 && vn < -7.7 && angle > 0.64)) {
          this.crash('nose-first'); out.landed = 'crash';
        } else if (angle > 0.48) {
          this.vx *= 0.76; this.vy *= 0.56; this.angular *= 0.38;
          out.landed = 'wobble'; this.lastLanding = 'WOBBLE';
        } else if (angle < 0.22 && impact > 1.1) {
          this.vx += t.x * Math.min(2.2, impact * 0.09);
          this.vy += t.y * Math.min(1.0, impact * 0.035);
          this.heat = Math.max(0, this.heat - 0.22);
          this.speedKick = 1.0;
          out.landed = 'clean'; this.lastLanding = 'CLEAN';
        } else if (impact > 0.75) {
          out.landed = 'ok'; this.lastLanding = 'OK';
        }
        if (out.landed) {
          this.airTime = 0; this.airRotation = 0; this.maxAirHeight = 0;
        }
      }
    }
    this.speedKick = Math.max(0, this.speedKick - dt * 1.9);

    // Lean has two jobs: ground balance and air rotation. Positive is BACK,
    // which raises the front and builds the analog wheelie meter.
    if (contacts) {
      torque += input.lean * 20.5;
      torque += input.gas ? 1.9 : 0;
      torque -= this.angular * 8.5;
    } else {
      torque += input.lean * 8.9;
      torque -= this.angular * 1.25;
      this.airTime += dt;
      this.airRotation += Math.abs(this.angular) * dt;
      this.maxAirHeight = Math.max(this.maxAirHeight, this.y);
      this.airHeight = Math.max(0, this.maxAirHeight - track.heightAt(this.x));
    }
    if (this.boosting) forceX += c * 4.3;
    if (this.speedKick > 0) forceX += Math.cos(groundSlope) * this.speedKick * 10;
    const speed = Math.hypot(this.vx, this.vy);
    forceX -= this.vx * speed * 0.012;
    forceY -= this.vy * speed * 0.018;

    this.vx += (forceX / MASS) * dt;
    this.vy += (forceY / MASS) * dt;
    this.angular = clamp(this.angular + (torque / INERTIA) * dt, -5.0, 5.0);
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.angle = wrap(this.angle + this.angular * dt);

    const front = this.wheel(1), rear = this.wheel(0);
    const frontGap = front.y - WR - track.heightAt(front.x);
    const rearGap = rear.y - WR - track.heightAt(rear.x);
    const lift = clamp((frontGap + 0.12) / 0.72, 0, 1);
    if (this.grounded[0] && !this.grounded[1] && this.vx > 3) {
      this.wheelieDistance += this.vx * dt;
      this.wheelieMeter += (lift * 1.8 + 0.15) * dt;
    } else {
      this.wheelieMeter += (lift * 0.35 - this.wheelieMeter * 1.5) * dt;
    }
    this.wheelieMeter = clamp(this.wheelieMeter, 0, 1);
    this.rpm = clamp(Math.abs(this.vx) / 31 + (input.gas ? 0.16 : 0), 0, 1);
    out.landingAngle = Math.abs(wrap(this.angle - groundSlope));

    // Chassis hit and upside-down checks intentionally sit behind the front
    // landing warning. The nose-first threshold is readable for a few frames.
    const bodyBottom = this.y - 0.18;
    if (!this.crashed && bodyBottom < track.heightAt(this.x) - 0.04) {
      this.crash('chassis'); out.landed = 'crash';
    }
    if (!this.crashed && Math.abs(this.angle) > 1.78) {
      this.crash('tumble'); out.landed = 'crash';
    }
    if (!this.crashed && this.y < track.heightAt(this.x) - 1.2) {
      this.crash('drop'); out.landed = 'crash';
    }
    out.air = this.airTime > 0;
    out.airHeight = this.airHeight;
    out.airRotation = this.airRotation;
    out.speed = this.vx;
    out.wheelie = this.wheelieMeter;
    out.dust = contacts && Math.abs(this.vx) > 3 ? (this.boosting ? 3 : 1) : 0;
    if (!wasAir && !contacts) this.airTime = Math.max(this.airTime, dt);
    if (oldAirHeight > this.y && this.airTime > 0) this.maxAirHeight = Math.max(this.maxAirHeight, oldAirHeight);
  }

  crash(kind) {
    if (this.crashed) return;
    this.crashed = true; this.crashKind = kind; this.boosting = false;
    this.angular += kind === 'nose-first' ? -1.1 : 0.7;
  }
}
