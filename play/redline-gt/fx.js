// fx.js — pooled particle systems for Redline GT.
// House procedural VFX pattern: fixed-size pools, one shared material per
// system, ballistic update, scale-fade to zero, hidden when dead. Three
// systems ship: dust/gravel kickup, speed streaks, collision sparks.
import * as THREE from 'three';

function makePoints(count, size, color, opts) {
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const alpha = new Float32Array(count);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setDrawRange(0, count);
  const mat = new THREE.PointsMaterial({
    size, sizeAttenuation: true, vertexColors: true, transparent: true,
    opacity: (opts && opts.opacity) != null ? opts.opacity : 0.85,
    depthWrite: false,
    blending: (opts && opts.additive) ? THREE.AdditiveBlending : THREE.NormalBlending,
    color,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return { pts, geo, mat, pos, col, alpha };
}

// Particles live far below the world when dead; no per-frame allocation and
// no array splicing anywhere in the update path.
const DEAD_Y = -9999;

export class ParticleSystem {
  constructor(count, size, color, opts) {
    const r = makePoints(count, size, color, opts);
    Object.assign(this, r);
    this.count = count;
    this.next = 0;
    this.life = new Float32Array(count);
    this.maxLife = new Float32Array(count);
    this.vel = new Float32Array(count * 3);
    this.baseCol = new THREE.Color(color);
    this.gravity = (opts && opts.gravity) != null ? opts.gravity : -14;
    this.drag = (opts && opts.drag) != null ? opts.drag : 1.6;
    this.fadeColor = opts && opts.fadeColor ? new THREE.Color(opts.fadeColor) : null;
    for (let i = 0; i < count; i++) this.pos[i * 3 + 1] = DEAD_Y;
    this.geo.attributes.position.needsUpdate = true;
  }

  emit(x, y, z, vx, vy, vz, life, color) {
    const i = this.next;
    this.next = (this.next + 1) % this.count;
    const p = i * 3;
    this.pos[p] = x; this.pos[p + 1] = y; this.pos[p + 2] = z;
    this.vel[p] = vx; this.vel[p + 1] = vy; this.vel[p + 2] = vz;
    this.life[i] = life; this.maxLife[i] = life;
    const c = color || this.baseCol;
    this.col[p] = c.r; this.col[p + 1] = c.g; this.col[p + 2] = c.b;
  }

  update(dt) {
    const { pos, vel, life, maxLife, col } = this;
    const dragF = Math.max(0, 1 - this.drag * dt);
    let live = false;
    for (let i = 0; i < this.count; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      const p = i * 3;
      if (life[i] <= 0) { pos[p + 1] = DEAD_Y; continue; }
      live = true;
      vel[p] *= dragF; vel[p + 2] *= dragF;
      vel[p + 1] = vel[p + 1] * dragF + this.gravity * dt;
      pos[p] += vel[p] * dt;
      pos[p + 1] += vel[p + 1] * dt;
      pos[p + 2] += vel[p + 2] * dt;
      // fade by darkening toward the fade colour (PointsMaterial has no
      // per-vertex alpha; colour ramp reads the same against dark scenes)
      const t = life[i] / maxLife[i];
      if (this.fadeColor) {
        const f = this.fadeColor;
        col[p] = f.r + (this.baseCol.r - f.r) * t;
        col[p + 1] = f.g + (this.baseCol.g - f.g) * t;
        col[p + 2] = f.b + (this.baseCol.b - f.b) * t;
      } else {
        col[p] *= 0.986; col[p + 1] *= 0.986; col[p + 2] *= 0.986;
      }
    }
    // Only flag the attributes when something actually moved. A dead pool used
    // to re-upload both full buffers every frame, which showed up in the feel
    // trace as periodic upload stalls with nothing on screen.
    if (live || this.wasLive) {
      this.geo.attributes.position.needsUpdate = true;
      this.geo.attributes.color.needsUpdate = true;
    }
    this.wasLive = live;
    this.pts.visible = live;
  }

  reset() {
    for (let i = 0; i < this.count; i++) {
      this.life[i] = 0;
      this.pos[i * 3 + 1] = DEAD_Y;
    }
    this.next = 0;
    this.geo.attributes.position.needsUpdate = true;
    this.pts.visible = false;
  }

  dispose() { this.geo.dispose(); this.mat.dispose(); }
}

// Speed streaks: short line segments that rush past the camera at high speed.
// Implemented as a LineSegments pool so they read as motion, not dots.
export class StreakSystem {
  constructor(count, color) {
    this.count = count;
    this.pos = new Float32Array(count * 6);
    this.col = new Float32Array(count * 6);
    this.life = new Float32Array(count);
    this.maxLife = new Float32Array(count);
    this.vel = new Float32Array(count * 3);
    this.next = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    const mat = new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.55,
      depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    });
    this.geo = geo; this.mat = mat;
    this.lines = new THREE.LineSegments(geo, mat);
    this.lines.frustumCulled = false;
    this.baseCol = new THREE.Color(color);
    for (let i = 0; i < count * 6; i += 3) this.pos[i + 1] = DEAD_Y;
    geo.attributes.position.needsUpdate = true;
  }

  emit(x, y, z, vx, vy, vz, life, len) {
    const i = this.next;
    this.next = (this.next + 1) % this.count;
    const p = i * 6;
    const n = Math.hypot(vx, vy, vz) || 1;
    this.pos[p] = x; this.pos[p + 1] = y; this.pos[p + 2] = z;
    this.pos[p + 3] = x - vx / n * len;
    this.pos[p + 4] = y - vy / n * len;
    this.pos[p + 5] = z - vz / n * len;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = life; this.maxLife[i] = life;
    const c = this.baseCol;
    for (let k = 0; k < 2; k++) {
      this.col[p + k * 3] = c.r; this.col[p + k * 3 + 1] = c.g; this.col[p + k * 3 + 2] = c.b;
    }
  }

  update(dt) {
    let live = false;
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const p = i * 6, v = i * 3;
      if (this.life[i] <= 0) { this.pos[p + 1] = DEAD_Y; this.pos[p + 4] = DEAD_Y; continue; }
      live = true;
      const dx = this.vel[v] * dt, dy = this.vel[v + 1] * dt, dz = this.vel[v + 2] * dt;
      this.pos[p] += dx; this.pos[p + 1] += dy; this.pos[p + 2] += dz;
      this.pos[p + 3] += dx; this.pos[p + 4] += dy; this.pos[p + 5] += dz;
      const t = this.life[i] / this.maxLife[i];
      for (let k = 0; k < 2; k++) {
        this.col[p + k * 3] = this.baseCol.r * t;
        this.col[p + k * 3 + 1] = this.baseCol.g * t;
        this.col[p + k * 3 + 2] = this.baseCol.b * t;
      }
    }
    if (live || this.wasLive) {
      this.geo.attributes.position.needsUpdate = true;
      this.geo.attributes.color.needsUpdate = true;
    }
    this.wasLive = live;
    this.lines.visible = live;
  }

  reset() {
    for (let i = 0; i < this.count; i++) {
      this.life[i] = 0;
      this.pos[i * 6 + 1] = DEAD_Y; this.pos[i * 6 + 4] = DEAD_Y;
    }
    this.next = 0;
    this.geo.attributes.position.needsUpdate = true;
    this.lines.visible = false;
  }

  dispose() { this.geo.dispose(); this.mat.dispose(); }
}

// Skid marks: a growing ribbon strip laid on the road when the car slides.
// Fixed vertex budget, oldest quads recycled (bounded array defect class).
// Each quad carries its own age and fades out: rubber that never faded turned
// a long stint into permanent black geometry across the whole circuit.
const SKID_LIFE = 7.0;      // seconds a mark stays at full strength
const SKID_FADE = 5.0;      // seconds it then takes to disappear

export class SkidTrail {
  constructor(maxQuads) {
    this.max = maxQuads;
    this.pos = new Float32Array(maxQuads * 18); // 6 verts * 3
    // rgba per vertex; three reads a 4-component colour attribute as
    // vertexAlphas, which is what lets a quad fade without its own draw call.
    this.col = new Float32Array(maxQuads * 24);
    this.age = new Float32Array(maxQuads);
    this.live = new Uint8Array(maxQuads);
    this.next = 0;
    this.used = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 4));
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff, vertexColors: true, transparent: true, opacity: 1,
      depthWrite: false, fog: true,
    });
    this.geo = geo; this.mat = mat;
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    for (let i = 1; i < maxQuads * 18; i += 3) this.pos[i] = DEAD_Y;
    this.tint = { r: 0.05, g: 0.05, b: 0.063 };
    this.strength = 0.46;
    // Previous contact pair held in a preallocated struct: pushing a quad ran
    // every frame while sliding and used to allocate an object plus a 18-slot
    // literal array each time, which fed the GC churn in the feel trace.
    this.prev = { on: false, ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0 };
  }

  // Surface context: tarmac rubber is dark, off-road scrub is a dust scar.
  setSurface(offRoad, dustColor) {
    if (offRoad && dustColor) {
      this.tint.r = dustColor.r * 0.65; this.tint.g = dustColor.g * 0.65; this.tint.b = dustColor.b * 0.65;
      this.strength = 0.34;
    } else {
      this.tint.r = 0.05; this.tint.g = 0.05; this.tint.b = 0.063;
      this.strength = 0.46;
    }
  }

  // a/b are the two rear-contact points for this frame.
  push(ax, ay, az, bx, by, bz) {
    const p = this.prev;
    if (p.on) {
      const idx = this.next;
      const i = idx * 18;
      this.next = (this.next + 1) % this.max;
      if (this.used < this.max) this.used++;
      const q = this.pos;
      q[i] = p.ax; q[i + 1] = p.ay; q[i + 2] = p.az;
      q[i + 3] = p.bx; q[i + 4] = p.by; q[i + 5] = p.bz;
      q[i + 6] = bx; q[i + 7] = by; q[i + 8] = bz;
      q[i + 9] = p.ax; q[i + 10] = p.ay; q[i + 11] = p.az;
      q[i + 12] = bx; q[i + 13] = by; q[i + 14] = bz;
      q[i + 15] = ax; q[i + 16] = ay; q[i + 17] = az;
      const c = idx * 24;
      for (let k = 0; k < 6; k++) {
        this.col[c + k * 4] = this.tint.r;
        this.col[c + k * 4 + 1] = this.tint.g;
        this.col[c + k * 4 + 2] = this.tint.b;
        this.col[c + k * 4 + 3] = this.strength;
      }
      this.age[idx] = 0;
      this.live[idx] = 1;
      this.geo.attributes.position.needsUpdate = true;
      this.geo.attributes.color.needsUpdate = true;
      this.mesh.visible = true;
    }
    p.on = true;
    p.ax = ax; p.ay = ay; p.az = az;
    p.bx = bx; p.by = by; p.bz = bz;
  }

  // Ageing runs on a coarse cadence: opacity only has to change a few times
  // per second to read as a fade, and a full-buffer re-upload every frame was
  // exactly the kind of steady-state cost the feel gate punishes.
  update(dt) {
    this.acc = (this.acc || 0) + dt;
    if (this.acc < 0.25) return;
    const step = this.acc;
    this.acc = 0;
    let any = false, changed = false;
    for (let i = 0; i < this.max; i++) {
      if (!this.live[i]) continue;
      this.age[i] += step;
      const a = this.age[i];
      if (a <= SKID_LIFE) { any = true; continue; }
      const f = 1 - (a - SKID_LIFE) / SKID_FADE;
      const c = i * 24;
      if (f <= 0) {
        this.live[i] = 0;
        const p = i * 18;
        for (let k = 1; k < 18; k += 3) this.pos[p + k] = DEAD_Y;
        this.geo.attributes.position.needsUpdate = true;
      } else {
        any = true;
        for (let k = 0; k < 6; k++) this.col[c + k * 4 + 3] = this.col[c + k * 4 + 3] * 0 + this.strength * f;
      }
      changed = true;
    }
    if (changed) this.geo.attributes.color.needsUpdate = true;
    this.mesh.visible = any;
  }

  break() { this.prev.on = false; }

  reset() {
    for (let i = 1; i < this.max * 18; i += 3) this.pos[i] = DEAD_Y;
    this.col.fill(0);
    this.age.fill(0);
    this.live.fill(0);
    this.next = 0; this.used = 0; this.prev.on = false; this.acc = 0;
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.mesh.visible = false;
  }

  dispose() { this.geo.dispose(); this.mat.dispose(); }
}

// Rain: a camera-locked column of falling line segments plus a wind shear, so
// the storm circuit actually renders the weather it declares. One LineSegments
// draw call; the whole system is skipped when reduced motion is on.
export class RainSystem {
  constructor(count, color) {
    this.count = count;
    this.pos = new Float32Array(count * 6);
    this.col = new Float32Array(count * 6);
    this.seed = new Float32Array(count * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    const mat = new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.5,
      depthWrite: false, fog: false,
    });
    this.geo = geo; this.mat = mat;
    this.lines = new THREE.LineSegments(geo, mat);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 4;
    const c = new THREE.Color(color);
    let n = 1234567;
    const rnd = () => { n = (n * 1664525 + 1013904223) >>> 0; return n / 4294967296; };
    for (let i = 0; i < count; i++) {
      this.seed[i * 3] = (rnd() * 2 - 1) * 34;      // x offset
      this.seed[i * 3 + 1] = rnd() * 26;            // height phase
      this.seed[i * 3 + 2] = (rnd() * 2 - 1) * 34;  // z offset
      const b = 0.6 + rnd() * 0.4;
      for (let k = 0; k < 2; k++) {
        this.col[i * 6 + k * 3] = c.r * b;
        this.col[i * 6 + k * 3 + 1] = c.g * b;
        this.col[i * 6 + k * 3 + 2] = c.b * b;
      }
    }
    this.t = 0;
    this.enabled = true;
  }

  // cx/cy/cz: camera position. Drops wrap in a box that follows the camera, so
  // the system never needs per-drop lifetime bookkeeping.
  update(dt, cx, cy, cz, intensity) {
    if (!this.enabled || intensity <= 0) { this.lines.visible = false; return; }
    this.lines.visible = true;
    this.t += dt;
    const fall = 42 * intensity;
    const len = 1.6 + intensity * 2.4;
    for (let i = 0; i < this.count; i++) {
      const s = i * 3, p = i * 6;
      const y = 26 - ((this.seed[s + 1] + this.t * fall) % 30);
      const x = cx + this.seed[s] + y * 0.18;
      const z = cz + this.seed[s + 2];
      this.pos[p] = x; this.pos[p + 1] = cy + y - 12; this.pos[p + 2] = z;
      this.pos[p + 3] = x + 0.28 * len; this.pos[p + 4] = cy + y - 12 - len; this.pos[p + 5] = z;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.mat.opacity = 0.18 + intensity * 0.35;
  }

  reset() { this.t = 0; this.lines.visible = false; }
  dispose() { this.geo.dispose(); this.mat.dispose(); }
}
