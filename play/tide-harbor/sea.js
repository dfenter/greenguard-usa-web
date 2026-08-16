/* Tide Harbor - sea.js
 * Gerstner ocean (GPU displacement + matching CPU sampler), gradient sky dome,
 * sun/moon, stars, and the time-of-day colour grade that every other module
 * reads from. Original GreenGuard studio work.
 *
 * The wave table below is the SINGLE source of truth: the vertex shader and the
 * CPU sampler are generated from it, so hull motion always matches the surface
 * the player can see.
 */
import * as THREE from 'three';

/* dirX, dirZ, amplitude, wavelength, speed, steepness */
export const WAVES = [
  [1.00, 0.16, 3.30, 430, 25.0, 0.60],
  [0.58, -0.81, 2.05, 232, 18.5, 0.54],
  [-0.44, 0.90, 1.10, 126, 13.5, 0.46],
  [0.87, 0.49, 0.52, 62, 9.2, 0.40],
];

const NORM = WAVES.map((w) => {
  const len = Math.hypot(w[0], w[1]) || 1;
  return { dx: w[0] / len, dz: w[1] / len, a: w[2], k: (Math.PI * 2) / w[3], s: w[4], q: w[5] };
});

/* ---------------------------------------------------------------- CPU sampler */
const _sample = { y: 0, nx: 0, ny: 1, nz: 0, foam: 0 };

/** Analytic Gerstner height + normal at world (x,z). Shared with the shader. */
export function sampleSea(x, z, time, energy) {
  const gain = energy == null ? 1 : energy;
  let y = 0, dydx = 0, dydz = 0, jac = 0;
  for (let i = 0; i < NORM.length; i++) {
    const w = NORM[i];
    const a = w.a * gain;
    const f = w.k * (w.dx * x + w.dz * z) + w.s * w.k * time;
    const sin = Math.sin(f), cos = Math.cos(f);
    y += a * sin;
    dydx += w.k * a * cos * w.dx;
    dydz += w.k * a * cos * w.dz;
    jac += w.q * w.k * a * sin;
  }
  const len = Math.hypot(-dydx, 1, -dydz) || 1;
  _sample.y = y;
  _sample.nx = -dydx / len;
  _sample.ny = 1 / len;
  _sample.nz = -dydz / len;
  _sample.foam = jac;
  return _sample;
}

/* ------------------------------------------------------------ time of day */
/* Keyframes run midnight -> midnight. Every field is linearly graded. */
const GRADE_KEYS = [
  { t: 0.00, skyTop: 0x061527, skyHorizon: 0x14304a, sun: 0x9fb6e8, sunI: 0.35, hemiSky: 0x2c4b6b, hemiGround: 0x081a24, hemiI: 0.55,
    fog: 0x102539, fogNear: 260, fogFar: 1180, deep: 0x040f1c, shallow: 0x0d2c3c, foam: 0x8fb4c8, spec: 0.35, stars: 1, lamps: 1, elev: -0.30, azi: 2.20, exposure: 1.02 },
  { t: 0.21, skyTop: 0x233a63, skyHorizon: 0x8a6478, sun: 0xffb98a, sunI: 0.85, hemiSky: 0x6d7fa4, hemiGround: 0x241d2a, hemiI: 0.95,
    fog: 0x6c5f78, fogNear: 300, fogFar: 1420, deep: 0x0a2333, shallow: 0x1d4d5c, foam: 0xd6c3c6, spec: 0.62, stars: 0.35, lamps: 0.85, elev: 0.02, azi: 1.55, exposure: 1.04 },
  { t: 0.30, skyTop: 0x3f86bd, skyHorizon: 0xd6c39a, sun: 0xffe7bb, sunI: 1.75, hemiSky: 0xa8d6e2, hemiGround: 0x1a3f4c, hemiI: 1.35,
    fog: 0x9fc3ca, fogNear: 340, fogFar: 1700, deep: 0x06283c, shallow: 0x1f6d78, foam: 0xe6f5f2, spec: 0.86, stars: 0, lamps: 0.2, elev: 0.30, azi: 1.20, exposure: 1.05 },
  { t: 0.50, skyTop: 0x2f8fd0, skyHorizon: 0xbfe4e6, sun: 0xfff3d2, sunI: 2.25, hemiSky: 0xc3ecf0, hemiGround: 0x1a4152, hemiI: 1.60,
    fog: 0x9ed2d8, fogNear: 380, fogFar: 1850, deep: 0x073047, shallow: 0x27818a, foam: 0xf2fffb, spec: 1.00, stars: 0, lamps: 0, elev: 0.72, azi: 0.40, exposure: 1.05 },
  { t: 0.70, skyTop: 0x3a86bb, skyHorizon: 0xe8c48d, sun: 0xffd79a, sunI: 1.85, hemiSky: 0xb6d5da, hemiGround: 0x2a3a3c, hemiI: 1.30,
    fog: 0xbfae9c, fogNear: 340, fogFar: 1680, deep: 0x08293b, shallow: 0x28707a, foam: 0xf5e9dc, spec: 0.92, stars: 0, lamps: 0.15, elev: 0.26, azi: -0.55, exposure: 1.06 },
  { t: 0.80, skyTop: 0x2a3f74, skyHorizon: 0xef8f63, sun: 0xff9d5e, sunI: 1.05, hemiSky: 0x7c7fa6, hemiGround: 0x2c2733, hemiI: 0.95,
    fog: 0xa8748a, fogNear: 300, fogFar: 1450, deep: 0x0a1e33, shallow: 0x275a6c, foam: 0xf0c3ac, spec: 0.70, stars: 0.28, lamps: 0.95, elev: 0.02, azi: -1.10, exposure: 1.05 },
  { t: 0.88, skyTop: 0x0d1e37, skyHorizon: 0x30365a, sun: 0xa9bce8, sunI: 0.45, hemiSky: 0x3a5677, hemiGround: 0x0c1c26, hemiI: 0.62,
    fog: 0x1c2d45, fogNear: 270, fogFar: 1220, deep: 0x05121f, shallow: 0x10333f, foam: 0x9db8cc, spec: 0.42, stars: 0.9, lamps: 1, elev: -0.22, azi: -1.90, exposure: 1.03 },
  { t: 1.00, skyTop: 0x061527, skyHorizon: 0x14304a, sun: 0x9fb6e8, sunI: 0.35, hemiSky: 0x2c4b6b, hemiGround: 0x081a24, hemiI: 0.55,
    fog: 0x102539, fogNear: 260, fogFar: 1180, deep: 0x040f1c, shallow: 0x0d2c3c, foam: 0x8fb4c8, spec: 0.35, stars: 1, lamps: 1, elev: -0.30, azi: -2.60, exposure: 1.02 },
];

const NUM_KEYS = ['sunI', 'hemiI', 'fogNear', 'fogFar', 'spec', 'stars', 'lamps', 'elev', 'azi', 'exposure'];
const COL_KEYS = ['skyTop', 'skyHorizon', 'sun', 'hemiSky', 'hemiGround', 'fog', 'deep', 'shallow', 'foam'];

function makeGrade() {
  const g = {};
  COL_KEYS.forEach((k) => { g[k] = new THREE.Color(); });
  NUM_KEYS.forEach((k) => { g[k] = 0; });
  g.sunDir = new THREE.Vector3(0, 1, 0);
  return g;
}
const _ca = new THREE.Color();
const _cb = new THREE.Color();

/** Grade the whole look for a normalised time of day (0..1, 0 = midnight). */
export function gradeFor(tod, out) {
  const g = out || makeGrade();
  const t = ((tod % 1) + 1) % 1;
  let i = 0;
  while (i < GRADE_KEYS.length - 2 && GRADE_KEYS[i + 1].t <= t) i++;
  const a = GRADE_KEYS[i], b = GRADE_KEYS[i + 1];
  const span = Math.max(1e-4, b.t - a.t);
  const raw = (t - a.t) / span;
  const f = raw * raw * (3 - 2 * raw);
  COL_KEYS.forEach((k) => { _ca.setHex(a[k]); _cb.setHex(b[k]); g[k].copy(_ca).lerp(_cb, f); });
  NUM_KEYS.forEach((k) => { g[k] = a[k] + (b[k] - a[k]) * f; });
  const ce = Math.cos(g.elev), se = Math.sin(g.elev);
  g.sunDir.set(Math.cos(g.azi) * ce, Math.max(0.06, se), Math.sin(g.azi) * ce).normalize();
  return g;
}
export { makeGrade };

/* ---------------------------------------------------------------- shaders */
function waveGLSL() {
  /* Unrolled so the loop cost is a compile-time constant on weak GPUs. */
  let decl = '';
  NORM.forEach((w, i) => {
    decl += 'const vec4 W' + i + ' = vec4(' + w.dx.toFixed(4) + ',' + w.dz.toFixed(4) + ',' + w.a.toFixed(4) + ',' + w.k.toFixed(6) + ');\n';
    decl += 'const vec2 P' + i + ' = vec2(' + w.s.toFixed(3) + ',' + w.q.toFixed(3) + ');\n';
  });
  let body = 'void gerstner(vec2 p, float t, float gain, out vec3 disp, out vec3 nrm, out float foam){\n' +
    ' disp = vec3(0.0); float dx=0.0, dz=0.0; foam=0.0;\n';
  NORM.forEach((w, i) => {
    body += ' {vec4 W=W' + i + '; vec2 P=P' + i + '; float A=W.z*gain; float f=W.w*(W.x*p.x+W.y*p.y)+P.x*W.w*t;' +
      ' float s=sin(f), c=cos(f);' +
      ' disp.x += P.y*A*W.x*c; disp.z += P.y*A*W.y*c; disp.y += A*s;' +
      ' dx += W.w*A*c*W.x; dz += W.w*A*c*W.y; foam += P.y*W.w*A*s;}\n';
  });
  body += ' nrm = normalize(vec3(-dx, 1.0, -dz));\n}\n';
  return decl + body;
}

const OCEAN_VERT = waveGLSL() + `
uniform float uTime;
uniform float uEnergy;
uniform vec2 uCenter;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vFoam;
varying float vShore;
uniform vec4 uShore[8];
void main(){
  vec2 p = position.xz + uCenter;
  vec3 disp; vec3 nrm; float foam;
  gerstner(p, uTime, uEnergy, disp, nrm, foam);
  vec3 world = vec3(p.x + disp.x, disp.y, p.y + disp.z);
  float shore = 0.0;
  /* 1 inside the disc, ramping to 0 across the fade band. Written as
   * 1 - smoothstep(lo, hi, d) because GLSL smoothstep is undefined when
   * edge0 > edge1, which silently poisoned the whole surface. */
  for(int i=0;i<8;i++){
    float d = distance(world.xz, uShore[i].xy);
    shore = max(shore, 1.0 - smoothstep(uShore[i].z, uShore[i].z + uShore[i].w, d));
  }
  world.y = mix(world.y, world.y * 0.25, shore);
  vShore = shore;
  vWorld = world;
  vNormal = nrm;
  vFoam = foam;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}`;

const OCEAN_FRAG = `
precision mediump float;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uFoamColor;
uniform vec3 uSunColor;
uniform vec3 uSunDir;
uniform vec3 uFogColor;
uniform vec2 uFogRange;
uniform float uSpec;
/* highp: uTime is shared with the vertex stage, and a precision mismatch on a
 * shared uniform fails program validation on some drivers. */
uniform highp float uTime;
uniform float uStormMix;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vFoam;
varying float vShore;
void main(){
  vec3 view = normalize(cameraPosition - vWorld);
  vec3 n = normalize(vNormal);
  float fres = pow(1.0 - max(dot(n, view), 0.0), 3.5);
  float facing = clamp(dot(n, vec3(0.0,1.0,0.0)), 0.0, 1.0);
  vec3 base = mix(uDeep, uShallow, facing * 0.55 + 0.22 + vShore * 0.5);
  base = mix(base, uShallow * 1.25 + 0.04, vShore * 0.7);
  /* crest foam from the wave Jacobian, plus a fine ripple break-up */
  float ripple = sin(vWorld.x * 0.09 + uTime * 1.5) * 0.5 + cos(vWorld.z * 0.11 - uTime * 1.15) * 0.5;
  float crest = smoothstep(0.34, 0.92, vFoam + ripple * 0.10 + uStormMix * 0.22);
  float shoreFoam = smoothstep(0.55, 0.98, vShore + sin(vWorld.x*0.16 + vWorld.z*0.13 + uTime*1.8)*0.12);
  float foam = clamp(crest + shoreFoam * 0.85, 0.0, 1.0);
  vec3 col = mix(base, uFoamColor, foam * 0.82);
  /* sun specular + sky fresnel rim */
  vec3 h = normalize(uSunDir + view);
  float spec = pow(max(dot(n, h), 0.0), 96.0) * uSpec;
  col += uSunColor * spec * 1.35;
  col = mix(col, uFogColor * 1.06, fres * 0.42);
  float d = length(cameraPosition - vWorld);
  float fog = smoothstep(uFogRange.x, uFogRange.y, d);
  col = mix(col, uFogColor, fog);
  gl_FragColor = vec4(col, 1.0);
}`;

const SKY_VERT = 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const SKY_FRAG = `
precision mediump float;
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uSunColor;
uniform vec3 uSunDir;
uniform float uStars;
uniform float uTime;
varying vec3 vDir;
float hash(vec3 p){ return fract(sin(dot(p, vec3(17.13, 91.7, 45.3))) * 43758.5453); }
void main(){
  vec3 d = normalize(vDir);
  float h = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 col = mix(uHorizon, uTop, pow(h, 0.85));
  /* sun / moon disc with a wide warm bloom */
  float sd = max(dot(d, normalize(uSunDir)), 0.0);
  col += uSunColor * pow(sd, 520.0) * 1.5;
  col += uSunColor * pow(sd, 12.0) * 0.34;
  /* horizon haze band */
  col = mix(col, uHorizon, smoothstep(0.16, -0.02, d.y) * 0.55);
  if (uStars > 0.01 && d.y > 0.02) {
    vec3 cell = floor(d * 150.0);
    float star = step(0.9955, hash(cell));
    float twinkle = 0.62 + 0.38 * sin(uTime * 2.1 + hash(cell + 3.0) * 12.0);
    col += vec3(0.85, 0.9, 1.0) * star * twinkle * uStars * smoothstep(0.02, 0.30, d.y);
  }
  gl_FragColor = vec4(col, 1.0);
}`;

/* ------------------------------------------------------------------ build */

/** Build the sky dome, the ocean, and the light rig. Returns a controller. */
export function createSea(scene, opts) {
  const options = opts || {};
  const span = options.span || 2500;
  const segments = options.segments || 112;

  const skyGeometry = new THREE.SphereGeometry(2600, 24, 16);
  const skyUniforms = {
    uTop: { value: new THREE.Color(0x2f8fd0) },
    uHorizon: { value: new THREE.Color(0xbfe4e6) },
    uSunColor: { value: new THREE.Color(0xfff3d2) },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uStars: { value: 0 },
    uTime: { value: 0 },
  };
  const sky = new THREE.Mesh(skyGeometry, new THREE.ShaderMaterial({
    uniforms: skyUniforms, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
    side: THREE.BackSide, depthWrite: false, fog: false,
  }));
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  scene.add(sky);

  const shoreData = [];
  for (let i = 0; i < 8; i++) shoreData.push(new THREE.Vector4(1e6, 1e6, 1, 1));
  const oceanUniforms = {
    uTime: { value: 0 },
    uEnergy: { value: 1 },
    uCenter: { value: new THREE.Vector2() },
    uDeep: { value: new THREE.Color(0x073047) },
    uShallow: { value: new THREE.Color(0x27818a) },
    uFoamColor: { value: new THREE.Color(0xf2fffb) },
    uSunColor: { value: new THREE.Color(0xfff3d2) },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uFogColor: { value: new THREE.Color(0x9ed2d8) },
    uFogRange: { value: new THREE.Vector2(380, 1850) },
    uSpec: { value: 1 },
    uStormMix: { value: 0 },
    uShore: { value: shoreData },
  };
  const oceanGeometry = new THREE.PlaneGeometry(span, span, segments, segments);
  oceanGeometry.rotateX(-Math.PI / 2);
  const ocean = new THREE.Mesh(oceanGeometry, new THREE.ShaderMaterial({
    uniforms: oceanUniforms, vertexShader: OCEAN_VERT, fragmentShader: OCEAN_FRAG, fog: false,
  }));
  ocean.frustumCulled = false;
  ocean.renderOrder = -5;
  scene.add(ocean);

  const hemi = new THREE.HemisphereLight(0xc3ecf0, 0x1a4152, 1.6);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff3d2, 2.2);
  sun.position.set(-240, 420, -180);
  scene.add(sun);

  const grade = makeGrade();
  const step = span / segments;
  let energy = 1;

  return {
    ocean, sky, sun, hemi, grade,
    uniforms: oceanUniforms,
    setEnergy(value) { energy = value; oceanUniforms.uEnergy.value = value; },
    getEnergy() { return energy; },
    setStormMix(value) { oceanUniforms.uStormMix.value = value; },
    /** Register up to 8 shallow-water discs (islands) so the sea flattens and foams. */
    setShores(list) {
      for (let i = 0; i < 8; i++) {
        const entry = list[i];
        if (entry) shoreData[i].set(entry.x, entry.z, entry.r, entry.fade || 90);
        else shoreData[i].set(1e6, 1e6, 1, 1);
      }
    },
    /** Recentre the ocean grid on the camera target, snapped to avoid swimming. */
    follow(x, z) {
      const cx = Math.round(x / step) * step;
      const cz = Math.round(z / step) * step;
      oceanUniforms.uCenter.value.set(cx, cz);
      ocean.position.set(0, 0, 0);
    },
    update(time, tod, scene3) {
      gradeFor(tod, grade);
      oceanUniforms.uTime.value = time;
      skyUniforms.uTime.value = time;
      oceanUniforms.uDeep.value.copy(grade.deep);
      oceanUniforms.uShallow.value.copy(grade.shallow);
      oceanUniforms.uFoamColor.value.copy(grade.foam);
      oceanUniforms.uSunColor.value.copy(grade.sun);
      oceanUniforms.uSunDir.value.copy(grade.sunDir);
      oceanUniforms.uFogColor.value.copy(grade.fog);
      oceanUniforms.uFogRange.value.set(grade.fogNear, grade.fogFar);
      oceanUniforms.uSpec.value = grade.spec;
      skyUniforms.uTop.value.copy(grade.skyTop);
      skyUniforms.uHorizon.value.copy(grade.skyHorizon);
      skyUniforms.uSunColor.value.copy(grade.sun);
      skyUniforms.uSunDir.value.copy(grade.sunDir);
      skyUniforms.uStars.value = grade.stars;
      sun.color.copy(grade.sun);
      sun.intensity = grade.sunI;
      sun.position.copy(grade.sunDir).multiplyScalar(600);
      hemi.color.copy(grade.hemiSky);
      hemi.groundColor.copy(grade.hemiGround);
      hemi.intensity = grade.hemiI;
      const target = scene3 || scene;
      if (target.fog) { target.fog.color.copy(grade.fog); target.fog.near = grade.fogNear; target.fog.far = grade.fogFar; }
      if (target.background && target.background.copy) target.background.copy(grade.fog);
      return grade;
    },
  };
}
