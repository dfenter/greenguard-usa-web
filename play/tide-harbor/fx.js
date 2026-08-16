/* Tide Harbor - fx.js
 * Every particle system in the title. All of them are POOLED and PRE-WARMED
 * during the loading screen: buffers are allocated once, the shader is compiled
 * once, and nothing allocates during play. Each field is a single THREE.Points
 * draw call rather than a crowd of sprite meshes.
 */
import * as THREE from 'three';
import * as bake from './bake.js';

const PARTICLE_VERT = `
attribute float aSize;
attribute float aAlpha;
attribute float aSpin;
attribute vec3 aColor;
varying float vAlpha;
varying float vSpin;
varying vec3 vColor;
uniform float uScale;
void main(){
  vAlpha = aAlpha;
  vSpin = aSpin;
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(1.0, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

const PARTICLE_FRAG = `
precision mediump float;
uniform sampler2D uMap;
uniform vec3 uFog;
uniform float uFogAmount;
varying float vAlpha;
varying float vSpin;
varying vec3 vColor;
void main(){
  if (vAlpha <= 0.002) discard;
  vec2 uv = gl_PointCoord - 0.5;
  float c = cos(vSpin), s = sin(vSpin);
  uv = vec2(uv.x * c - uv.y * s, uv.x * s + uv.y * c) + 0.5;
  vec4 tex = texture2D(uMap, uv);
  vec3 col = mix(vColor * tex.rgb, uFog, uFogAmount);
  gl_FragColor = vec4(col, tex.a * vAlpha);
  if (gl_FragColor.a < 0.004) discard;
}`;

/** Pooled point-sprite field. Fixed capacity; oldest slot is recycled. */
export class ParticleField {
  constructor(scene, count, texture, opts) {
    const options = opts || {};
    this.count = count;
    this.cursor = 0;
    this.live = 0;
    this.positions = new Float32Array(count * 3);
    this.velocities = new Float32Array(count * 3);
    this.sizes = new Float32Array(count);
    this.alphas = new Float32Array(count);
    this.spins = new Float32Array(count);
    this.spinRates = new Float32Array(count);
    this.colors = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    this.maxLife = new Float32Array(count);
    this.grow = new Float32Array(count);
    this.gravity = options.gravity == null ? -22 : options.gravity;
    this.drag = options.drag == null ? 1.1 : options.drag;
    this.fade = options.fade || 'linear';

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1));
    geometry.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphas, 1));
    geometry.setAttribute('aSpin', new THREE.BufferAttribute(this.spins, 1));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(this.colors, 3));
    geometry.setDrawRange(0, count);
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: texture },
        uScale: { value: 320 },
        uFog: { value: new THREE.Color(0x9ed2d8) },
        uFogAmount: { value: 0 },
      },
      vertexShader: PARTICLE_VERT,
      fragmentShader: PARTICLE_FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: options.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = options.renderOrder == null ? 3 : options.renderOrder;
    this.geometry = geometry;
    scene.add(this.points);
    this._color = new THREE.Color();
  }

  /** Claim a slot. Never allocates. */
  spawn(x, y, z, vx, vy, vz, size, life, colorHex, grow) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.count;
    const p = i * 3;
    this.positions[p] = x; this.positions[p + 1] = y; this.positions[p + 2] = z;
    this.velocities[p] = vx; this.velocities[p + 1] = vy; this.velocities[p + 2] = vz;
    this.sizes[i] = size;
    this.alphas[i] = 1;
    this.spins[i] = Math.random() * 6.28;
    this.spinRates[i] = (Math.random() - 0.5) * 2.4;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.grow[i] = grow == null ? 1 : grow;
    this._color.setHex(colorHex == null ? 0xffffff : colorHex);
    this.colors[p] = this._color.r; this.colors[p + 1] = this._color.g; this.colors[p + 2] = this._color.b;
    return i;
  }

  update(dt) {
    let live = 0;
    const damp = Math.exp(-this.drag * dt);
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) { if (this.alphas[i] !== 0) this.alphas[i] = 0; continue; }
      this.life[i] -= dt;
      const p = i * 3;
      this.velocities[p] *= damp;
      this.velocities[p + 1] = this.velocities[p + 1] * damp + this.gravity * dt;
      this.velocities[p + 2] *= damp;
      this.positions[p] += this.velocities[p] * dt;
      this.positions[p + 1] += this.velocities[p + 1] * dt;
      this.positions[p + 2] += this.velocities[p + 2] * dt;
      const t = Math.max(0, this.life[i] / this.maxLife[i]);
      this.alphas[i] = this.fade === 'pop' ? Math.sin(t * Math.PI) : t * t;
      this.sizes[i] *= 1 + (this.grow[i] - 1) * dt;
      this.spins[i] += this.spinRates[i] * dt;
      live++;
    }
    this.live = live;
    const attr = this.geometry.attributes;
    attr.position.needsUpdate = true;
    attr.aSize.needsUpdate = true;
    attr.aAlpha.needsUpdate = true;
    attr.aSpin.needsUpdate = true;
    attr.aColor.needsUpdate = true;
    this.points.visible = live > 0;
  }

  clear() {
    for (let i = 0; i < this.count; i++) { this.life[i] = 0; this.alphas[i] = 0; }
    this.update(0);
  }

  setFog(color, amount) {
    this.material.uniforms.uFog.value.copy(color);
    this.material.uniforms.uFogAmount.value = amount;
  }
}

/* --------------------------------------------------------------- streaks */

const STREAK_VERT = `
attribute float aAlpha;
attribute float aLen;
varying float vAlpha;
uniform float uScale;
void main(){
  vAlpha = aAlpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aLen * uScale / max(1.0, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const STREAK_FRAG = `
precision mediump float;
uniform vec3 uColor;
varying float vAlpha;
void main(){
  if (vAlpha <= 0.004) discard;
  vec2 d = gl_PointCoord - 0.5;
  float a = smoothstep(0.5, 0.0, abs(d.x) * 7.0) * smoothstep(0.5, 0.05, abs(d.y));
  gl_FragColor = vec4(uColor, a * vAlpha);
}`;

/** Rain / speed-line streaks. One draw call, pooled. */
export class StreakField {
  constructor(scene, count, colorHex) {
    this.count = count;
    this.positions = new Float32Array(count * 3);
    this.alphas = new Float32Array(count);
    this.lens = new Float32Array(count);
    this.speed = new Float32Array(count);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geometry.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphas, 1));
    geometry.setAttribute('aLen', new THREE.BufferAttribute(this.lens, 1));
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
    this.material = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(colorHex) }, uScale: { value: 300 } },
      vertexShader: STREAK_VERT, fragmentShader: STREAK_FRAG,
      transparent: true, depthWrite: false,
    });
    this.points = new THREE.Points(geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 4;
    this.geometry = geometry;
    scene.add(this.points);
    this.active = false;
  }

  /** Re-seed the whole field around a centre; call when the storm moves. */
  seed(cx, cz, spread, height) {
    for (let i = 0; i < this.count; i++) {
      const p = i * 3;
      this.positions[p] = cx + (Math.random() - 0.5) * spread;
      this.positions[p + 1] = Math.random() * height;
      this.positions[p + 2] = cz + (Math.random() - 0.5) * spread;
      this.alphas[i] = 0.18 + Math.random() * 0.3;
      this.lens[i] = 26 + Math.random() * 30;
      this.speed[i] = 130 + Math.random() * 90;
    }
  }

  update(dt, cx, cz, spread, height, intensity) {
    if (!this.active) { this.points.visible = false; return; }
    this.points.visible = true;
    for (let i = 0; i < this.count; i++) {
      const p = i * 3;
      this.positions[p + 1] -= this.speed[i] * dt;
      if (this.positions[p + 1] < 0) {
        this.positions[p] = cx + (Math.random() - 0.5) * spread;
        this.positions[p + 1] = height * (0.7 + Math.random() * 0.4);
        this.positions[p + 2] = cz + (Math.random() - 0.5) * spread;
      }
      this.alphas[i] = (0.16 + (i % 7) * 0.03) * intensity;
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.aAlpha.needsUpdate = true;
  }
}

/* ------------------------------------------------------------ trail mesh */

/** Foam ribbon laid behind the hull. Fixed-length ring buffer, no allocation. */
export class WakeRibbon {
  constructor(scene, segments) {
    this.segments = segments;
    this.head = 0;
    this.filled = 0;
    this.trail = [];
    for (let i = 0; i < segments; i++) this.trail.push({ x: 0, z: 0, w: 0, age: 1e9 });
    const verts = segments * 2;
    this.positions = new Float32Array(verts * 3);
    this.uvs = new Float32Array(verts * 2);
    this.alphas = new Float32Array(verts);
    const indices = [];
    for (let i = 0; i < segments - 1; i++) {
      const a = i * 2;
      indices.push(a, a + 1, a + 3, a, a + 3, a + 2);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(this.uvs, 2));
    geometry.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphas, 1));
    geometry.setIndex(indices);
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
    this.material = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: bake.wakeStrip() }, uTint: { value: new THREE.Color(0xf2fffb) } },
      vertexShader: 'attribute float aAlpha; varying vec2 vUv; varying float vA; void main(){ vUv=uv; vA=aAlpha; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: 'precision mediump float; uniform sampler2D uMap; uniform vec3 uTint; varying vec2 vUv; varying float vA; void main(){ vec4 t=texture2D(uMap,vUv); gl_FragColor=vec4(uTint*t.rgb, t.a*vA); if(gl_FragColor.a<0.004) discard; }',
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.geometry = geometry;
    scene.add(this.mesh);
  }

  push(x, z, width) {
    const node = this.trail[this.head];
    node.x = x; node.z = z; node.w = width; node.age = 0;
    this.head = (this.head + 1) % this.segments;
    this.filled = Math.min(this.filled + 1, this.segments);
  }

  update(dt, sample, time, energy, visible) {
    this.mesh.visible = visible && this.filled > 3;
    if (!this.mesh.visible) return;
    for (let i = 0; i < this.segments; i++) this.trail[i].age += dt;
    for (let i = 0; i < this.segments; i++) {
      const node = this.trail[(this.head + i) % this.segments];
      const next = this.trail[(this.head + Math.min(i + 1, this.segments - 1)) % this.segments];
      let dx = next.x - node.x;
      let dz = next.z - node.z;
      const len = Math.hypot(dx, dz) || 1;
      dx /= len; dz /= len;
      const life = Math.max(0, 1 - node.age / 3.4);
      const w = node.w * (0.6 + (1 - life) * 1.9);
      const y = sample ? sample(node.x, node.z, time, energy) + 0.55 : 0.55;
      const a = i * 6;
      this.positions[a] = node.x - dz * w;
      this.positions[a + 1] = y;
      this.positions[a + 2] = node.z + dx * w;
      this.positions[a + 3] = node.x + dz * w;
      this.positions[a + 4] = y;
      this.positions[a + 5] = node.z - dx * w;
      const u = i / (this.segments - 1);
      this.uvs[i * 4] = u; this.uvs[i * 4 + 1] = 0;
      this.uvs[i * 4 + 2] = u; this.uvs[i * 4 + 3] = 1;
      const alpha = life * life * 0.85;
      this.alphas[i * 2] = alpha;
      this.alphas[i * 2 + 1] = alpha;
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.uv.needsUpdate = true;
    this.geometry.attributes.aAlpha.needsUpdate = true;
  }

  clear() {
    this.trail.forEach((node) => { node.age = 1e9; });
    this.filled = 0;
  }
}

/* --------------------------------------------------------------- manager */

/** All fields in one place, with the quality tier and reduced-motion gate. */
export function createFX(scene, tier) {
  const scale = tier === 'low' ? 0.45 : tier === 'medium' ? 0.7 : 1;
  const foam = bake.foamPuff();
  const fields = {
    spray: new ParticleField(scene, Math.round(220 * scale), foam, { gravity: -34, drag: 1.5 }),
    foam: new ParticleField(scene, Math.round(160 * scale), foam, { gravity: -1.5, drag: 2.6, renderOrder: 2 }),
    splash: new ParticleField(scene, Math.round(140 * scale), foam, { gravity: -46, drag: 1.2, fade: 'pop' }),
    sparkle: new ParticleField(scene, Math.round(120 * scale), bake.blob('rgba(255,255,255,1)', 'rgba(255,208,120,.5)'), { gravity: -14, drag: 1.5, additive: true, fade: 'pop' }),
    embers: new ParticleField(scene, Math.round(80 * scale), bake.blob('rgba(255,236,190,1)', 'rgba(255,150,60,.4)'), { gravity: 9, drag: 0.7, additive: true }),
  };
  const rain = new StreakField(scene, Math.round(300 * scale), 0xc9d8f2);
  const wake = new WakeRibbon(scene, 46);
  const bowWake = new WakeRibbon(scene, 26);

  const lightning = new THREE.PointLight(0xdfe9ff, 0, 1400, 1.6);
  lightning.position.set(0, 220, 0);
  scene.add(lightning);
  let boltTimer = 0;

  return {
    fields, rain, wake, bowWake, lightning, tier,

    /** Force shader compile + buffer upload before the loading screen closes. */
    prewarm(renderer, camera) {
      Object.keys(fields).forEach((key) => {
        const field = fields[key];
        for (let i = 0; i < Math.min(8, field.count); i++) field.spawn(0, -4000, 0, 0, 0, 0, 4, 0.001, 0xffffff, 1);
        field.update(0.016);
      });
      rain.active = true;
      rain.seed(0, -4000, 10, 10);
      rain.update(0.016, 0, -4000, 10, 10, 0.01);
      rain.active = false;
      wake.push(0, -4000, 1);
      bowWake.push(0, -4000, 1);
      if (renderer && camera) renderer.compile(scene, camera);
      Object.keys(fields).forEach((key) => fields[key].clear());
    },

    setFog(color, amount) {
      Object.keys(fields).forEach((key) => fields[key].setFog(color, amount));
    },

    /* --------------------------------------------------- emit helpers */
    emitSpray(x, y, z, heading, speed, count) {
      const n = Math.max(1, Math.round(count * scale));
      for (let i = 0; i < n; i++) {
        const side = Math.random() < 0.5 ? -1 : 1;
        const ax = Math.cos(heading + Math.PI / 2) * side;
        const az = Math.sin(heading + Math.PI / 2) * side;
        fields.spray.spawn(
          x + ax * 5, y + 1.4, z + az * 5,
          ax * (11 + speed * 0.16) - Math.cos(heading) * speed * 0.18 + (Math.random() - 0.5) * 7,
          13 + Math.random() * 15 + speed * 0.11,
          az * (11 + speed * 0.16) - Math.sin(heading) * speed * 0.18 + (Math.random() - 0.5) * 7,
          6 + Math.random() * 8, 0.5 + Math.random() * 0.42, 0xf2fffb, 2.1
        );
      }
    },
    emitFoam(x, z, y, size) {
      fields.foam.spawn(x + (Math.random() - 0.5) * 6, y + 0.4, z + (Math.random() - 0.5) * 6,
        (Math.random() - 0.5) * 3, 0.6, (Math.random() - 0.5) * 3,
        size, 1.5 + Math.random(), 0xeafffb, 2.6);
    },
    burstSplash(x, y, z, power, colorHex) {
      const n = Math.round(18 * power * scale);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = 6 + Math.random() * 16 * power;
        fields.splash.spawn(x, y, z,
          Math.cos(a) * r, 20 + Math.random() * 34 * power, Math.sin(a) * r,
          7 + Math.random() * 12 * power, 0.55 + Math.random() * 0.5, colorHex || 0xf2fffb, 1.7);
      }
    },
    burstSparkle(x, y, z, power, colorHex) {
      const n = Math.round(20 * power * scale);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const e = Math.random() * 1.1;
        const r = 10 + Math.random() * 26 * power;
        fields.sparkle.spawn(x, y + 4, z,
          Math.cos(a) * r * Math.cos(e), 26 + Math.random() * 40 * power, Math.sin(a) * r * Math.cos(e),
          5 + Math.random() * 9, 0.7 + Math.random() * 0.7, colorHex || 0xffd27a, 1.15);
      }
    },
    burstEmber(x, y, z, power) {
      const n = Math.round(12 * power * scale);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        fields.embers.spawn(x, y, z,
          Math.cos(a) * (5 + Math.random() * 14), 9 + Math.random() * 22, Math.sin(a) * (5 + Math.random() * 14),
          4 + Math.random() * 7, 1.1 + Math.random(), 0xffb45e, 1.02);
      }
    },
    strike(x, z, intensity) {
      lightning.position.set(x, 240, z);
      lightning.intensity = intensity;
      boltTimer = 0.16;
    },

    update(dt, reduced) {
      Object.keys(fields).forEach((key) => fields[key].update(dt));
      if (boltTimer > 0) { boltTimer -= dt; lightning.intensity *= 0.62; }
      else lightning.intensity = 0;
      if (reduced) lightning.intensity = 0;
    },

    clear() {
      Object.keys(fields).forEach((key) => fields[key].clear());
      wake.clear();
      bowWake.clear();
    },
  };
}
