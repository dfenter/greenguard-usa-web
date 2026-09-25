// ---------------------------------------------------------------------------
//  Marble Mania 2: background spectacle layer.
//
//  Everything here is decoration that sits BEHIND the course in depth:
//   * a camera-centred additive shader dome (nebulae, auroras, light shafts,
//     caustics, glints, lightning) for themes that look down into open sky,
//   * an additive shader floor over the ground plane for plane themes (lava,
//     neon grid, cloud sea, crystal veins, ocean caustics),
//   * GPU-animated ambient drift (embers, snow, rain, bubbles, motes),
//   * one pooled CPU particle system (hard cap) for fireworks and event bursts,
//   * a small pool of shockwave rings.
//  All materials are additive with depthWrite off and depthTest on, so opaque
//  track geometry always wins. Nothing here reads or writes game state.
// ---------------------------------------------------------------------------
import * as THREE from 'three';

const TAU = Math.PI*2;
const rnd = (a, b) => a + Math.random()*(b-a);

// Theme kits. w = [nebula, aurora, rays, glints], caus = caustic weight,
// floor = ground-plane mode (planes only), drift = ambient particle kind.
const K = (o) => Object.assign({
  w:[0,0,0,0], caus:0, bow:0, rift:0, floor:0, colA:0xffffff, colB:0xffffff, colC:0xffffff, inten:1,
  drift:'motes', driftCol:0xffffff, driftN:260, driftSize:1.0,
  fwEvery:2.6, fwPal:[0xff5a5a,0xffd257,0x5ad8ff,0xb77dff,0x7dffb0], lightning:0, lightCol:0xcfe0ff,
}, o);
const THEMES = {
  'Dawn Meadow':     K({ w:[.18,0,.6,.45], bow:.5, colA:0xffb38a, colB:0xffe2a8, colC:0xfff0c0, drift:'motes', driftCol:0xffe6a0,
                         fwEvery:2.0, fwPal:[0xffb0c8,0xffe08a,0xa8e0ff,0xd0b0ff] }),
  'Daylight Plains': K({ w:[.16,0,.6,.45], bow:1, colA:0xffffff, colB:0xbfe4ff, colC:0xfff6d0, drift:'motes', driftCol:0xffffff,
                         fwEvery:2.0 }),
  'Alpine Cliffs':   K({ w:[.2,.35,.5,.45], colA:0xcfe8ff, colB:0x9ad0ff, colC:0xe8f6ff, drift:'snow', driftCol:0xffffff, driftN:340,
                         fwEvery:2.2, fwPal:[0x9ad8ff,0xffffff,0xc0a8ff,0x7dffe0] }),
  'Red Canyon':      K({ w:[.3,0,.65,.35], colA:0xff8a4a, colB:0xffc07a, colC:0xffe0b0, drift:'dust', driftCol:0xffb070,
                         fwEvery:2.0, fwPal:[0xff6a3a,0xffd257,0xff9ad0,0x7ad8ff] }),
  'Desert Fortress': K({ w:[.25,0,.65,.5], colA:0xffc46a, colB:0xff9a5a, colC:0xfff0b0, drift:'dust', driftCol:0xffd9a0,
                         fwEvery:2.0, fwPal:[0xffd257,0xff7a3a,0xffffff,0x6ae0ff] }),
  'Sunset Towers':   K({ w:[.45,0,.5,.45], colA:0xff5aa8, colB:0xffa04a, colC:0xffd08a, drift:'embers', driftCol:0xffb060,
                         fwEvery:1.8, fwPal:[0xff4a9a,0xffb040,0xffe070,0x9a6aff,0x5ad8ff] }),
  'Cloud Kingdom':   K({ w:[0,0,0,.5], floor:1, colA:0xfff0f8, colB:0xff9ad0, colC:0x9ad8ff, drift:'motes', driftCol:0xffffff,
                         fwEvery:2.5, fwPal:[0xff9ad0,0x9ad8ff,0xffe08a,0xc0a8ff] }),
  'Highland Storm':  K({ w:[.8,0,.25,.15], colA:0x5a7ab0, colB:0x9ab8e8, colC:0xcfe0ff, drift:'rain', driftCol:0xa8c8ff, driftN:420,
                         lightning:1.6, lightCol:0xd8e6ff, fwEvery:2.8, fwPal:[0xcfe0ff,0x7ab8ff,0xffffff] }),
  'Volcanic Rim':    K({ w:[0,0,0,.2], floor:2, colA:0xff4a10, colB:0xffb030, colC:0xff2a00, drift:'embers', driftCol:0xff8a30, driftN:380,
                         lightning:.6, lightCol:0xff7a30, fwEvery:1.9, fwPal:[0xff5020,0xffb030,0xffe080,0xff3060] }),
  'Crystal Cavern':  K({ w:[0,0,0,.6], floor:3, colA:0x40e0ff, colB:0xc060ff, colC:0xa0fff0, drift:'glitter', driftCol:0x9af0ff, driftN:320,
                         fwEvery:2.2, fwPal:[0x40e0ff,0xc060ff,0xa0fff0,0xff80e0] }),
  'Neon City':       K({ w:[0,0,0,.5], floor:4, colA:0xff2ad0, colB:0x20e0ff, colC:0xffe040, drift:'sparks', driftCol:0x80f0ff, driftN:300,
                         fwEvery:1.5, fwPal:[0xff2ad0,0x20e0ff,0xffe040,0x60ff90,0xa060ff] }),
  'Archipelago':     K({ w:[0,0,0,.5], floor:5, colA:0x40d8e8, colB:0xa0fff0, colC:0xfff0c0, drift:'motes', driftCol:0xe8ffff,
                         fwEvery:2.6, fwPal:[0x5ae0ff,0xffe08a,0xff8ab0,0x8affb0] }),
  'Aurora Tundra':   K({ w:[.2,1,0,.55], colA:0x40ff9a, colB:0x9a5aff, colC:0x40c8ff, drift:'snow', driftCol:0xe0f0ff, driftN:340,
                         fwEvery:2.2, fwPal:[0x40ff9a,0x9a5aff,0x5ad8ff,0xff7ad0] }),
  'Thunder Straits': K({ w:[0,0,0,.35], floor:5, colA:0x3a70a0, colB:0x80b8ff, colC:0xcfe0ff, drift:'rain', driftCol:0xa8c8ff, driftN:420,
                         lightning:1.6, lightCol:0xd8e6ff, fwEvery:2.6, fwPal:[0xcfe0ff,0x7ab8ff,0xffffff,0xffe08a] }),
  'Sky Temple':      K({ w:[0,0,0,.55], floor:1, colA:0xfff0c0, colB:0xffa040, colC:0xffe080, drift:'motes', driftCol:0xffe0a0,
                         fwEvery:2.3, fwPal:[0xffd257,0xffffff,0xffa060,0xa0d8ff] }),
  'Waterfall Gorge': K({ w:[.15,0,.45,.4], caus:.7, bow:.8, colA:0x60f0d0, colB:0xa0e0ff, colC:0xe8fff8, drift:'bubbles', driftCol:0xc8fff0,
                         fwEvery:2.6, fwPal:[0x60f0d0,0xa0e0ff,0xffe08a,0xff9ad0] }),
  'Nether Rift':     K({ w:[.6,0,0,.5], rift:1.1, colA:0x9a2aff, colB:0xff2a6a, colC:0xff9a40, drift:'embers', driftCol:0xd070ff, driftN:340,
                         lightning:.8, lightCol:0xc060ff, fwEvery:1.7, fwPal:[0xb040ff,0xff3070,0xff9a40,0x60e0ff] }),
  'Deep Space':      K({ w:[1,.25,0,1], colA:0x3a5aff, colB:0xff3ab0, colC:0x40e8ff, drift:'glitter', driftCol:0xcfe0ff, driftN:320,
                         fwEvery:1.7, fwPal:[0x5a8aff,0xff4ab0,0x40e8ff,0xffe070,0xa060ff] }),
};

// ---- shared GLSL ----------------------------------------------------------
const NOISE = `
  float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
  float vnoise(vec2 p){
    vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
    return mix(mix(hash(i), hash(i+vec2(1.0,0.0)), u.x), mix(hash(i+vec2(0.0,1.0)), hash(i+vec2(1.0,1.0)), u.x), u.y);
  }
  float fbm(vec2 p){
    float v = 0.0, a = 0.5;
    for(int i=0;i<OCT;i++){ v += a*vnoise(p); p = p*2.03 + vec2(17.1, 9.2); a *= 0.5; }
    return v;
  }
  float glints(vec2 p, float t){
    vec2 c = floor(p), f = fract(p) - 0.5;
    float h = hash(c);
    if(h < 0.965) return 0.0;
    vec2 o = vec2(hash(c+3.1), hash(c+7.7)) - 0.5;
    float d = length(f - o*0.6);
    float tw = 0.55 + 0.45*sin(t*(1.5+h*3.0) + h*60.0);
    return smoothstep(0.12, 0.0, d)*tw;
  }
  float caustic(vec2 p, float t){
    // Bounded caustic net: domain-warped sine cells, bright where cells meet.
    vec2 q = p;
    for(int n=0;n<3;n++){
      float fn = float(n);
      q += vec2(sin(q.y*1.7 + t*(0.9 + 0.3*fn)), cos(q.x*1.5 - t*(0.7 + 0.2*fn)))*0.42;
    }
    float v = sin(q.x*2.0)*sin(q.y*2.0);
    float w = sin(q.x*1.3 + q.y*0.7 + t*0.5)*sin(q.y*1.9 - q.x*0.4);
    return pow(1.0 - abs(v), 16.0) + pow(1.0 - abs(w), 22.0)*0.5;
  }
`;

const DOME_VS = `
  varying vec3 vDir;
  void main(){ vDir = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position, 1.0); }
`;
const DOME_FS = `
  uniform float uTime, uInten; uniform vec4 uW; uniform float uCaus, uBow, uRift;
  uniform vec3 uA, uB, uC, uFlash;
  varying vec3 vDir;
  ${NOISE}
  void main(){
    vec3 d = normalize(vDir);
    float ay = abs(d.y);
    // Seam-free domain: per-hemisphere stereographic projection.
    vec2 P = d.xz/(1.0 + ay);
    float t = uTime;
    vec3 col = vec3(0.0);
    float cloud = 0.0;
    if(uW.x > 0.0){
      vec2 q = P*3.2;
      float w = fbm(q*0.8 + vec2(t*0.012, -t*0.008));
      float n = fbm(q + w*2.2 + vec2(-t*0.006, t*0.01));
      cloud = n;
      float pulse = 0.85 + 0.15*sin(t*0.6 + n*6.0);
      vec3 neb = mix(uA, uB, smoothstep(0.35, 0.75, w));
      neb = mix(neb, uC, smoothstep(0.62, 0.9, n)*0.6);
      col += neb*pow(smoothstep(0.4, 0.95, n), 2.0)*0.8*pulse*uW.x;
    }
    if(uW.y > 0.0){
      float warp = fbm(P*2.0 + vec2(t*0.03, 0.0));
      float a = sin(P.x*5.0 + P.y*2.5 + warp*6.0 + t*0.22);
      float a2 = sin(P.x*3.1 - P.y*4.2 + warp*5.0 - t*0.17 + 1.7);
      float band = pow(1.0 - abs(a), 2.2)*0.8 + pow(1.0 - abs(a2), 3.0)*0.5;
      vec2 sd = normalize(P + 1e-4);
      float streak = 0.35 + 0.65*vnoise(vec2(dot(sd, vec2(-sd.y, sd.x) + P*9.0)*18.0 + warp*6.0, t*0.5));
      float shimmer = 0.75 + 0.25*sin(t*1.7 + P.x*20.0);
      vec3 ac = mix(uA, uB, smoothstep(0.3, 0.8, warp));
      col += ac*band*streak*shimmer*smoothstep(0.99, 0.35, ay)*1.1*uW.y;
      col += uC*pow(band, 3.0)*0.25*uW.y;
    }
    if(uW.z > 0.0){
      vec2 cs = normalize(P + 1e-4);
      float r1 = vnoise(cs*7.0 + vec2(t*0.05, -t*0.03));
      float r2 = vnoise(cs*15.0 - vec2(t*0.04, t*0.06));
      float rays = smoothstep(0.5, 0.92, r1) + 0.6*smoothstep(0.58, 0.95, r2);
      float breathe = 0.8 + 0.2*sin(t*0.4);
      col += uC*rays*breathe*smoothstep(0.99, 0.6, ay)*smoothstep(0.02, 0.25, ay)*0.5*uW.z;
    }
    if(uCaus > 0.0){
      float c = caustic(P*9.0 + vec2(3.0), t*0.35);
      col += mix(uA, uB, 0.5 + 0.5*sin(t*0.3))*c*0.28*uCaus;
    }
    if(uRift > 0.0){
      // Energy rifts: ridged noise cracks with a travelling pulse.
      vec2 q = P*5.0;
      float w = fbm(q*0.5 + vec2(t*0.02, -t*0.015));
      float r = 1.0 - abs(vnoise(q + w*2.2)*2.0 - 1.0);
      float r2 = 1.0 - abs(vnoise(q*2.1 - w*1.6 + t*0.05)*2.0 - 1.0);
      float cr = pow(r, 12.0) + pow(r2, 16.0)*0.5;
      float pulse = 0.6 + 0.4*sin(t*1.8 - length(P)*9.0 + w*6.0);
      col += mix(uB, uC, pow(r, 18.0))*cr*pulse*uRift;
      cloud = max(cloud, cr);
    }
    if(uBow > 0.0){
      // Rainbow ring around the nadir: from the chase camera it reads as an arc under the course.
      float r = length(P + vec2(0.04*sin(t*0.05), 0.0));
      float x = (r - 0.46)/0.05;
      vec3 hue = clamp(abs(fract(clamp(x*0.5 + 0.5, 0.0, 1.0)*0.8 + vec3(0.0, 2.0/3.0, 1.0/3.0))*6.0 - 3.0) - 1.0, 0.0, 1.0);
      float m = smoothstep(1.0, 0.7, abs(x))*(0.75 + 0.25*sin(t*0.3 + atan(P.y, P.x)*2.0));
      col += hue*m*0.22*uBow;
    }
    if(uW.w > 0.0){
      float g = glints(P*70.0, t) + glints(P*38.0 + 11.0, t*0.8)*0.8;
      col += mix(vec3(1.0), uC, 0.35)*g*0.9*uW.w;
    }
    col += uFlash*(0.2 + 0.5*cloud);
    gl_FragColor = vec4(col*uInten, 1.0);
  }
`;

const FLOOR_VS = `
  varying vec3 vW;
  void main(){
    vec4 w = modelMatrix*vec4(position, 1.0); vW = w.xyz;
    gl_Position = projectionMatrix*viewMatrix*w;
  }
`;
const FLOOR_FS = `
  uniform float uTime, uInten, uGlint; uniform int uMode;
  uniform vec3 uA, uB, uC, uFlash, uCam;
  varying vec3 vW;
  ${NOISE}
  void main(){
    vec2 W = vW.xz;
    float t = uTime;
    float dist = length(W - uCam.xz);
    vec3 col = vec3(0.0);
    float mask = 0.5;
    if(uMode == 1){            // drifting cloud sea
      vec2 q = W*0.028;
      float w = fbm(q + vec2(t*0.04, t*0.025));
      float n = fbm(q*1.6 + w*1.8 - vec2(t*0.03, 0.0));
      mask = n;
      float lit = 0.6 + 0.4*sin(W.x*0.02 + W.y*0.012 - t*0.35 + w*4.0);
      col += mix(uB, uA, smoothstep(0.35, 0.8, n))*pow(smoothstep(0.38, 0.85, n), 1.4)*1.0*lit;
      col += uC*pow(smoothstep(0.55, 0.95, w), 2.0)*0.35;
    } else if(uMode == 2){     // lava lake: ridged cracks, pulsing heat
      vec2 q = W*0.03;
      float w = fbm(q*0.6 + vec2(t*0.015, -t*0.01));
      float r = 1.0 - abs(vnoise(q + w*2.0)*2.0 - 1.0);
      float r2 = 1.0 - abs(vnoise(q*2.3 - w*1.5 + t*0.03)*2.0 - 1.0);
      float cracks = pow(r, 10.0) + pow(r2, 14.0)*0.6;
      float pulse = 0.65 + 0.35*sin(t*1.4 - dist*0.03 + w*8.0);
      mask = w;
      col += mix(uA, uB, pow(r, 14.0))*cracks*pulse*0.95;
      col += uC*smoothstep(0.45, 0.8, w)*0.12*(0.7 + 0.3*sin(t*0.8));
    } else if(uMode == 3){     // crystal veins with travelling light
      vec2 q = W*0.025;
      float w = fbm(q*0.7 + t*0.01);
      float r = 1.0 - abs(vnoise(q + w*2.5)*2.0 - 1.0);
      float vein = pow(r, 12.0);
      float travel = 0.5 + 0.5*sin(dist*0.06 - t*1.8 + w*5.0);
      mask = w;
      col += mix(uA, uB, smoothstep(0.3, 0.7, w))*vein*(0.35 + 0.65*travel)*0.9;
    } else if(uMode == 4){     // neon grid city with pulses and lit blocks
      vec2 g = W/12.0;
      vec2 gw = abs(fract(g - 0.5) - 0.5)/fwidth(g);
      float line = 1.0 - min(min(gw.x, gw.y), 1.0);
      float wave = exp(-pow((fract(dist/160.0 - t*0.18) - 0.5)*10.0, 2.0));
      vec2 cell = floor(g);
      float h = hash(cell);
      float blink = step(0.86, h)*(0.5 + 0.5*sin(t*(1.0 + h*4.0) + h*30.0));
      vec2 f = fract(g) - 0.5;
      float m = max(abs(f.x), abs(f.y));
      float win = smoothstep(0.26, 0.3, m)*smoothstep(0.36, 0.32, m)*blink;
      vec3 lc = mix(uA, uB, 0.5 + 0.5*sin(cell.x*0.7 + cell.y*0.4 + t*0.5));
      col += lc*line*(0.28 + 0.9*wave);
      col += mix(uB, uC, step(0.95, h))*win*0.45;
      mask = 0.4 + wave;
    } else if(uMode == 5){     // sea: caustics and sun glitter
      float c = caustic(W*0.09, t*0.45);
      float swell = fbm(W*0.01 + vec2(t*0.02, 0.0));
      mask = swell;
      col += mix(uA, uB, swell)*c*0.32;
      col += uA*smoothstep(0.55, 0.8, swell)*0.08;
    }
    if(uGlint > 0.0) col += uC*glints(W*0.22, t)*0.8*uGlint;
    col += uFlash*(0.15 + 0.45*mask);
    float fade = smoothstep(470.0, 260.0, dist);
    gl_FragColor = vec4(col*uInten*fade, 1.0);
  }
`;

// Ambient drift: all motion in the vertex shader, zero CPU per frame.
const DRIFT_VS = `
  attribute vec4 aSeed;
  uniform float uTime, uScale, uNear0, uNear1, uSize;
  uniform vec3 uCenter, uBox, uVel, uWobble;
  varying float vA; varying float vTw;
  void main(){
    vec3 v = uVel*(0.55 + 0.9*aSeed.w);
    vec3 wob = uWobble*vec3(sin(uTime*0.9 + aSeed.w*40.0), sin(uTime*1.3 + aSeed.x*30.0), cos(uTime*0.7 + aSeed.z*50.0));
    vec3 raw = aSeed.xyz*uBox + v*uTime + wob - uCenter + uBox*0.5;
    vec3 local = mod(raw, uBox) - uBox*0.5;
    vec3 wp = uCenter + local;
    vec4 mv = viewMatrix*vec4(wp, 1.0);
    float depth = -mv.z;
    vec3 e = abs(local)/(uBox*0.5);
    float edge = 1.0 - smoothstep(0.8, 1.0, max(max(e.x, e.y), e.z));
    vA = edge*smoothstep(uNear0, uNear1, depth);
    vTw = aSeed.w;
    gl_PointSize = clamp(uSize*(0.6 + 0.8*fract(aSeed.w*7.3))*uScale/max(depth, 1.0), 1.0, 28.0);
    gl_Position = projectionMatrix*mv;
  }
`;
const DRIFT_FS = `
  uniform vec3 uColor; uniform int uKind; uniform float uTime, uAlpha;
  varying float vA; varying float vTw;
  void main(){
    vec2 c = gl_PointCoord - 0.5;
    float r = length(c)*2.0;
    float a;
    if(uKind == 1) a = smoothstep(1.0, 0.8, r)*smoothstep(0.45, 0.8, r) + smoothstep(0.5, 0.0, length(c + vec2(0.15, 0.15))*2.0)*0.6;
    else if(uKind == 2) a = smoothstep(0.12, 0.0, abs(c.x))*smoothstep(0.5, 0.2, abs(c.y));
    else a = pow(max(0.0, 1.0 - r), 2.0);
    float tw = 0.65 + 0.35*sin(uTime*(2.0 + vTw*5.0) + vTw*80.0);
    gl_FragColor = vec4(uColor, a*vA*tw*uAlpha);
  }
`;

const POOL_VS = `
  attribute vec4 aColor; attribute vec2 aSize;
  uniform float uScale, uNear0, uNear1;
  varying vec4 vColor;
  void main(){
    vec4 mv = modelViewMatrix*vec4(position, 1.0);
    float depth = max(-mv.z, 0.5);
    float f = aSize.y > 0.5 ? 1.0 : smoothstep(uNear0, uNear1, depth);
    vColor = vec4(aColor.rgb, aColor.a*f);
    gl_PointSize = clamp(aSize.x*uScale/depth, 1.0, 96.0);
    gl_Position = projectionMatrix*mv;
  }
`;
const POOL_FS = `
  varying vec4 vColor;
  void main(){
    float r = length(gl_PointCoord - 0.5)*2.0;
    float halo = pow(max(0.0, 1.0 - r), 1.6);
    float core = pow(max(0.0, 1.0 - r*2.2), 2.0);
    gl_FragColor = vec4(vColor.rgb*halo*1.5 + vec3(core)*0.8, min(1.0, halo + core)*vColor.a);
  }
`;

const DRIFT_KINDS = {
  // vel (units/s), wobble amplitude, sprite kind, size, alpha
  motes:   { vel:[1.2, 1.4, -0.8], wob:[3, 2, 3], kind:0, size:1.1, alpha:.7 },
  dust:    { vel:[4.0, 0.6, 1.5],  wob:[2, 1, 2], kind:0, size:0.9, alpha:.55 },
  snow:    { vel:[1.5, -5.0, 0.8], wob:[3, 0, 3], kind:0, size:1.0, alpha:.85 },
  rain:    { vel:[3.0, -48, 1.0],  wob:[0, 0, 0], kind:2, size:1.8, alpha:.45 },
  embers:  { vel:[0.8, 6.5, -0.5], wob:[4, 1, 4], kind:0, size:1.0, alpha:.95 },
  sparks:  { vel:[0.0, 3.0, 0.0],  wob:[6, 3, 6], kind:0, size:0.9, alpha:.9 },
  glitter: { vel:[0.4, 0.8, 0.3],  wob:[2, 2, 2], kind:0, size:0.8, alpha:1 },
  bubbles: { vel:[0.3, 5.0, 0.2],  wob:[2, 0, 2], kind:1, size:1.6, alpha:.7 },
};

export class Spectacle {
  constructor(scene, renderer, opts = {}){
    this.scene = scene;
    this.renderer = renderer;
    this.lowPower = !!opts.lowPower;
    this.CAP = this.lowPower ? 700 : 1400;          // hard cap, event + firework particles
    this.driftScale = this.lowPower ? 0.55 : 1;      // ambient drift count multiplier (max 420 desktop)
    this.oct = this.lowPower ? 3 : 4;
    this.time = 0;
    this.theme = null;
    this.planeY = null;
    this.flash = new THREE.Vector3();
    this.flashColor = new THREE.Color();
    this.nextFw = 2; this.nextBolt = 4; this.boltStep = 0; this.boltT = 0;
    this.celebrateTier = null; this.celebrateNext = 0;
    this._v = new THREE.Vector3(); this._d = new THREE.Vector3(); this._c = new THREE.Color(); this._fwd = new THREE.Vector3();
    this.themeGroup = new THREE.Group();
    scene.add(this.themeGroup);
    this.dome = null; this.floor = null; this.drift = null;
    this._buildPool();
    this._buildRings();
    this._buildShells();
    this._buildBolts();
  }

  // ---- particle pool ------------------------------------------------------
  _buildPool(){
    const N = this.CAP;
    this.n = 0;
    this.px = new Float32Array(N); this.py = new Float32Array(N); this.pz = new Float32Array(N);
    this.vx = new Float32Array(N); this.vy = new Float32Array(N); this.vz = new Float32Array(N);
    this.age = new Float32Array(N); this.life = new Float32Array(N);
    this.drag = new Float32Array(N); this.grav = new Float32Array(N);
    this.sz = new Float32Array(N); this.near = new Uint8Array(N); this.tw = new Uint8Array(N);
    this.cr = new Float32Array(N); this.cg = new Float32Array(N); this.cb = new Float32Array(N); this.a0 = new Float32Array(N);
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(new Float32Array(N*3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(new Float32Array(N*4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aSz  = new THREE.BufferAttribute(new Float32Array(N*2), 2).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos); g.setAttribute('aColor', this.aCol); g.setAttribute('aSize', this.aSz);
    g.setDrawRange(0, 0);
    this.poolUniforms = { uScale:{ value:800 }, uNear0:{ value:40 }, uNear1:{ value:70 } };
    const m = new THREE.ShaderMaterial({ uniforms:this.poolUniforms, vertexShader:POOL_VS, fragmentShader:POOL_FS,
      transparent:true, depthWrite:false, depthTest:true, blending:THREE.AdditiveBlending, fog:false });
    this.pool = new THREE.Points(g, m);
    this.pool.frustumCulled = false;
    this.pool.renderOrder = 5;
    this.scene.add(this.pool);
  }

  _emit(x, y, z, vx, vy, vz, life, size, hex, opts){
    if(this.n >= this.CAP) return;
    const i = this.n++;
    this.px[i] = x; this.py[i] = y; this.pz[i] = z;
    this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    this.age[i] = 0; this.life[i] = life; this.sz[i] = size;
    this.drag[i] = opts ? opts.drag : 1.6; this.grav[i] = opts ? opts.grav : 6;
    this.near[i] = opts && opts.near ? 1 : 0; this.tw[i] = opts && opts.tw ? 1 : 0;
    this.a0[i] = opts && opts.a !== undefined ? opts.a : 1;
    this._c.setHex(hex);
    this.cr[i] = this._c.r; this.cg[i] = this._c.g; this.cb[i] = this._c.b;
  }

  _kill(i){
    const j = --this.n;
    if(i === j) return;
    this.px[i] = this.px[j]; this.py[i] = this.py[j]; this.pz[i] = this.pz[j];
    this.vx[i] = this.vx[j]; this.vy[i] = this.vy[j]; this.vz[i] = this.vz[j];
    this.age[i] = this.age[j]; this.life[i] = this.life[j]; this.sz[i] = this.sz[j];
    this.drag[i] = this.drag[j]; this.grav[i] = this.grav[j]; this.near[i] = this.near[j]; this.tw[i] = this.tw[j];
    this.cr[i] = this.cr[j]; this.cg[i] = this.cg[j]; this.cb[i] = this.cb[j]; this.a0[i] = this.a0[j];
  }

  _stepPool(dt){
    const P = this.aPos.array, C = this.aCol.array, S = this.aSz.array;
    for(let i=0;i<this.n;){
      this.age[i] += dt;
      if(this.age[i] >= this.life[i]){ this._kill(i); continue; }
      const k = Math.exp(-this.drag[i]*dt);
      this.vx[i] *= k; this.vy[i] = this.vy[i]*k - this.grav[i]*dt; this.vz[i] *= k;
      this.px[i] += this.vx[i]*dt; this.py[i] += this.vy[i]*dt; this.pz[i] += this.vz[i]*dt;
      const u = this.age[i]/this.life[i];
      let a = this.a0[i]*Math.pow(1-u, 1.4);
      if(this.tw[i] && u > .35 && Math.random() < .45) a *= .15;
      P[i*3] = this.px[i]; P[i*3+1] = this.py[i]; P[i*3+2] = this.pz[i];
      C[i*4] = this.cr[i]; C[i*4+1] = this.cg[i]; C[i*4+2] = this.cb[i]; C[i*4+3] = a;
      S[i*2] = this.sz[i]*(1 - u*.35); S[i*2+1] = this.near[i];
      i++;
    }
    const n = this.n;
    this.pool.geometry.setDrawRange(0, n);
    if(n){
      this.aPos.clearUpdateRanges(); this.aPos.addUpdateRange(0, n*3); this.aPos.needsUpdate = true;
      this.aCol.clearUpdateRanges(); this.aCol.addUpdateRange(0, n*4); this.aCol.needsUpdate = true;
      this.aSz.clearUpdateRanges();  this.aSz.addUpdateRange(0, n*2);  this.aSz.needsUpdate = true;
    }
  }

  // ---- shockwave rings ----------------------------------------------------
  _buildRings(){
    this.rings = [];
    const geo = new THREE.RingGeometry(.93, 1, 64);
    geo.rotateX(-Math.PI/2);
    for(let i=0;i<4;i++){
      const m = new THREE.MeshBasicMaterial({ color:0xffffff, transparent:true, opacity:0, depthWrite:false,
        blending:THREE.AdditiveBlending, side:THREE.DoubleSide, toneMapped:false, fog:false });
      const mesh = new THREE.Mesh(geo, m);
      mesh.visible = false; mesh.renderOrder = 6; mesh.frustumCulled = false;
      this.scene.add(mesh);
      this.rings.push({ mesh, t:0, dur:1, r:10, delay:0 });
    }
  }
  _ring(x, y, z, hex, radius, dur, delay = 0){
    let best = this.rings[0];
    for(const r of this.rings) if(!r.mesh.visible && r.delay <= 0){ best = r; break; }
    best.mesh.position.set(x, y, z);
    best.mesh.material.color.setHex(hex);
    best.t = 0; best.dur = dur; best.r = radius; best.delay = delay;
    best.mesh.visible = delay <= 0; best.mesh.scale.setScalar(.01);
    best.pending = delay > 0;
  }
  _stepRings(dt){
    for(const r of this.rings){
      if(r.pending){ r.delay -= dt; if(r.delay <= 0){ r.pending = false; r.mesh.visible = true; } continue; }
      if(!r.mesh.visible) continue;
      r.t += dt;
      const u = r.t/r.dur;
      if(u >= 1){ r.mesh.visible = false; continue; }
      const e = 1 - Math.pow(1-u, 3);
      r.mesh.scale.set(.2 + e*r.r, 1, .2 + e*r.r);
      r.mesh.material.opacity = (1-u)*(1-u)*.6;
    }
  }

  // ---- firework shells ----------------------------------------------------
  _buildShells(){
    this.shells = [];
    for(let i=0;i<24;i++) this.shells.push({ on:false, x:0, y:0, z:0, sx:0, sy:0, sz:0, tx:0, ty:0, tz:0, t:0, dur:1, pal:null, type:0, big:1 });
    this.queue = [];
    for(let i=0;i<40;i++) this.queue.push({ on:false, t:0, pal:null, big:1 });
  }
  _queueShells(count, spread, pal, big = 1){
    let k = 0;
    for(const q of this.queue){
      if(k >= count) break;
      if(q.on) continue;
      q.on = true; q.t = k === 0 ? 0 : Math.random()*spread; q.pal = pal; q.big = big; k++;
    }
  }
  _launch(camera, pal, big){
    let s = null;
    for(const c of this.shells) if(!c.on){ s = c; break; }
    if(!s) return;
    // Aim at the upper part of the screen, far beyond the marble, so bursts
    // read as background. Pull closer if the ground plane would hide them.
    const nx = rnd(-.88, .88), ny = rnd(.12, .86);
    this._v.set(nx, ny, .5).unproject(camera);
    this._d.copy(this._v).sub(camera.position).normalize();
    let dist = rnd(120, 200);
    if(this.planeY !== null && this._d.y < 0){
      const maxD = (camera.position.y - (this.planeY + 14))/(-this._d.y);
      dist = Math.min(dist, Math.max(maxD, 75));
    }
    s.tx = camera.position.x + this._d.x*dist;
    s.ty = camera.position.y + this._d.y*dist;
    s.tz = camera.position.z + this._d.z*dist;
    const rise = rnd(26, 40);
    s.sx = s.tx + rnd(-4, 4); s.sy = s.ty - rise; s.sz = s.tz + rnd(-4, 4);
    s.x = s.sx; s.y = s.sy; s.z = s.sz;
    s.t = 0; s.dur = rnd(.75, 1.1); s.on = true; s.pal = pal; s.big = big;
    s.type = Math.floor(Math.random()*4);
  }
  _burst(s){
    const pal = s.pal;
    const cA = pal[Math.floor(Math.random()*pal.length)];
    const cB = pal[Math.floor(Math.random()*pal.length)];
    const q = this.lowPower ? .6 : 1;
    const big = s.big;
    // flash core
    this._emit(s.x, s.y, s.z, 0, 0, 0, .28, 22*big, 0xffffff, { drag:0, grav:0, near:0, a:.9 });
    if(s.type === 0 || s.type === 3){           // peony (3: glitter peony)
      const N = Math.round(80*q*big), sp = rnd(30, 38)*big;
      for(let i=0;i<N;i++){
        const u = Math.random()*2-1, th = Math.random()*TAU, r = Math.sqrt(1-u*u);
        const v = sp*(.85 + Math.random()*.15);
        this._emit(s.x, s.y, s.z, Math.cos(th)*r*v, u*v, Math.sin(th)*r*v, rnd(1.2, 1.8), 3.4,
          i & 1 ? cA : cB, { drag:1.7, grav:5, tw:s.type === 3 });
      }
    } else if(s.type === 1){                    // ring, random tilt
      const N = Math.round(60*q*big), sp = rnd(32, 38)*big;
      const tilt = rnd(.2, 1.2), yaw = rnd(0, TAU), cy = Math.cos(yaw), sy = Math.sin(yaw);
      const ct = Math.cos(tilt), st = Math.sin(tilt);
      for(let i=0;i<N;i++){
        const th = i/N*TAU, c = Math.cos(th), sn = Math.sin(th);
        const lx = c, ly = sn*st, lz = sn*ct;
        const x = lx*cy - lz*sy, y = ly, z = lx*sy + lz*cy;
        this._emit(s.x, s.y, s.z, x*sp, y*sp, z*sp, rnd(1.1, 1.5), 3.5, cA, { drag:1.8, grav:4 });
      }
      for(let i=0;i<N/3;i++){
        const u = Math.random()*2-1, th = Math.random()*TAU, r = Math.sqrt(1-u*u), v = sp*.4;
        this._emit(s.x, s.y, s.z, Math.cos(th)*r*v, u*v, Math.sin(th)*r*v, 1.1, 2.2, cB, { drag:1.8, grav:4 });
      }
    } else {                                    // willow: long golden drape
      const N = Math.round(70*q*big), sp = rnd(24, 30)*big;
      for(let i=0;i<N;i++){
        const u = Math.random()*2-1, th = Math.random()*TAU, r = Math.sqrt(1-u*u), v = sp*(.8 + Math.random()*.2);
        this._emit(s.x, s.y, s.z, Math.cos(th)*r*v, u*v + 4, Math.sin(th)*r*v, rnd(2.0, 2.8), 3.0,
          i % 3 ? 0xffd070 : cA, { drag:2.1, grav:7, tw:true });
      }
    }
    this.pulse(cA, .1*big);
  }
  // Lightning: a jagged camera-facing ribbon (core + glow) plus one fork,
  // rebuilt only when a strike fires, then faded out. Two strikes in flight max.
  _buildBolts(){
    this.bolts = [];
    const SEG = 56;
    for(let k=0;k<2;k++){
      const make = (opacity) => {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SEG*6*3), 3).setUsage(THREE.DynamicDrawUsage));
        const m = new THREE.MeshBasicMaterial({ color:0xffffff, transparent:true, opacity, depthWrite:false,
          blending:THREE.AdditiveBlending, side:THREE.DoubleSide, toneMapped:false, fog:false });
        const mesh = new THREE.Mesh(g, m);
        mesh.visible = false; mesh.frustumCulled = false; mesh.renderOrder = 3;
        this.scene.add(mesh);
        return mesh;
      };
      this.bolts.push({ core:make(1), glow:make(.3), t:0, dur:.5, on:false });
    }
    this._pts = new Float32Array((SEG+1)*3);
    this._right = new THREE.Vector3();
  }
  _ribbon(mesh, pts, count, segStart, width){
    const arr = mesh.geometry.attributes.position.array, R = this._right;
    let o = segStart*18;
    for(let i=0;i<count-1;i++){
      const ax = pts[i*3], ay = pts[i*3+1], az = pts[i*3+2];
      const bx = pts[i*3+3], by = pts[i*3+4], bz = pts[i*3+5];
      const w0 = width*(1 - i/count*.6), w1 = width*(1 - (i+1)/count*.6);
      const v = [ax-R.x*w0, ay-R.y*w0, az-R.z*w0,  ax+R.x*w0, ay+R.y*w0, az+R.z*w0,  bx+R.x*w1, by+R.y*w1, bz+R.z*w1,
                  ax-R.x*w0, ay-R.y*w0, az-R.z*w0,  bx+R.x*w1, by+R.y*w1, bz+R.z*w1,  bx-R.x*w1, by-R.y*w1, bz-R.z*w1 ];
      for(let j=0;j<18;j++) arr[o++] = v[j];
    }
    return segStart + count - 1;
  }
  _bolt(camera, hex){
    if(!this.bolts) this._buildBolts();
    const b = this.bolts[0].on ? this.bolts[1] : this.bolts[0];
    this._v.set((Math.random() < .5 ? -1 : 1)*rnd(.4, .9), rnd(.35, .92), .5).unproject(camera);
    this._d.copy(this._v).sub(camera.position).normalize();
    let dist = rnd(150, 230);
    if(this.planeY !== null && this._d.y < 0) dist = Math.min(dist, Math.max(110, (camera.position.y - (this.planeY + 20))/(-this._d.y)));
    let x = camera.position.x + this._d.x*dist, z = camera.position.z + this._d.z*dist;
    const yTop = camera.position.y + this._d.y*dist + 80;
    const yBot = this.planeY !== null ? this.planeY + .5 : yTop - 170;
    this._right.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    const R = this._right, P = this._pts;
    const MAIN = 40, dy = (yTop - yBot)/MAIN;
    let lat = 0;
    for(let i=0;i<=MAIN;i++){
      lat += rnd(-3.5, 3.5);
      P[i*3] = x + R.x*lat; P[i*3+1] = yTop - i*dy + rnd(-.8, .8); P[i*3+2] = z + R.z*lat;
    }
    const forkAt = Math.floor(MAIN*rnd(.25, .5));
    let seg = this._ribbon(b.core, P, MAIN+1, 0, .45);
    this._ribbon(b.glow, P, MAIN+1, 0, 2.6);
    // fork
    const fx = P[forkAt*3], fy = P[forkAt*3+1], fz = P[forkAt*3+2];
    const dir = Math.random() < .5 ? -1 : 1;
    let fl = 0;
    const FORK = 16;
    for(let i=0;i<=FORK;i++){
      fl += dir*rnd(1.5, 4);
      P[i*3] = fx + R.x*fl; P[i*3+1] = fy - i*dy*.8; P[i*3+2] = fz + R.z*fl;
    }
    const endSeg = this._ribbon(b.core, P, FORK+1, seg, .3);
    this._ribbon(b.glow, P, FORK+1, seg, 1.8);
    for(const m of [b.core, b.glow]){
      m.geometry.setDrawRange(0, endSeg*6);
      m.geometry.attributes.position.needsUpdate = true;
      m.material.color.setHex(m === b.core ? 0xffffff : hex);
      m.visible = true;
    }
    b.t = 0; b.dur = rnd(.35, .55); b.on = true;
    this._emit(x + R.x*lat, yBot + 2, z + R.z*lat, 0, 0, 0, .45, 34, hex, { drag:0, grav:0, a:.7 });
  }
  _stepBolts(dt){
    if(!this.bolts) return;
    for(const b of this.bolts){
      if(!b.on) continue;
      b.t += dt;
      const u = b.t/b.dur;
      if(u >= 1){ b.on = false; b.core.visible = b.glow.visible = false; continue; }
      const flick = u < .5 ? (Math.random() < .3 ? .35 : 1) : 1;
      b.core.material.opacity = (1-u)*flick;
      b.glow.material.opacity = (1-u)*.35*flick;
    }
  }

  _stepShells(dt){
    for(const s of this.shells){
      if(!s.on) continue;
      s.t += dt;
      const u = Math.min(1, s.t/s.dur), e = 1 - (1-u)*(1-u);
      s.x = s.sx + (s.tx-s.sx)*e; s.y = s.sy + (s.ty-s.sy)*e; s.z = s.sz + (s.tz-s.sz)*e;
      this._emit(s.x, s.y, s.z, rnd(-1, 1), rnd(-3, -1), rnd(-1, 1), .45, 1.1, 0xffd9a0, { drag:2, grav:2, tw:true, a:.8 });
      if(u >= 1){ s.on = false; this._burst(s); }
    }
  }

  // ---- theme build --------------------------------------------------------
  clearTheme(){
    for(const o of [...this.themeGroup.children]){
      o.geometry && o.geometry.dispose();
      o.material && o.material.dispose();
    }
    this.themeGroup.clear();
    this.dome = this.floor = this.drift = null;
    this.theme = null;
    this.n = 0; this.pool.geometry.setDrawRange(0, 0);
    for(const s of this.shells) s.on = false;
    for(const q of this.queue) q.on = false;
    for(const r of this.rings){ r.mesh.visible = false; r.pending = false; }
    if(this.bolts) for(const b of this.bolts){ b.on = false; b.core.visible = b.glow.visible = false; }
    this.celebrateTier = null;
    this.flash.set(0, 0, 0);
  }

  setTheme(env){
    this.clearTheme();
    const th = THEMES[env && env.theme] || K({ w:[.35,0,.2,.5], colA:env ? env.skyHorizon : 0x6a8aff,
      colB:env ? env.skyTop : 0xb77dff, colC:0xffffff });
    this.theme = th;
    this.planeY = env && env.plane ? env.plane.y : null;
    const A = new THREE.Color(th.colA), B = new THREE.Color(th.colB), C = new THREE.Color(th.colC);
    const defines = { OCT:this.oct };

    if(this.planeY === null){
      this.domeU = { uTime:{ value:0 }, uInten:{ value:th.inten }, uW:{ value:new THREE.Vector4(...th.w) },
        uCaus:{ value:th.caus }, uBow:{ value:th.bow }, uRift:{ value:th.rift }, uA:{ value:A }, uB:{ value:B }, uC:{ value:C }, uFlash:{ value:this.flash } };
      this.dome = new THREE.Mesh(new THREE.SphereGeometry(520, 48, 24), new THREE.ShaderMaterial({
        uniforms:this.domeU, defines, vertexShader:DOME_VS, fragmentShader:DOME_FS, side:THREE.BackSide,
        transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, fog:false }));
      this.dome.renderOrder = -5; this.dome.frustumCulled = false;
      this.themeGroup.add(this.dome);
    } else {
      this.floorU = { uTime:{ value:0 }, uInten:{ value:th.inten }, uGlint:{ value:th.w[3] }, uMode:{ value:th.floor },
        uA:{ value:A }, uB:{ value:B }, uC:{ value:C }, uFlash:{ value:this.flash }, uCam:{ value:new THREE.Vector3() } };
      const geo = new THREE.CircleGeometry(480, 72); geo.rotateX(-Math.PI/2);
      this.floor = new THREE.Mesh(geo, new THREE.ShaderMaterial({
        uniforms:this.floorU, defines, vertexShader:FLOOR_VS, fragmentShader:FLOOR_FS,
        transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, fog:false,
        polygonOffset:true, polygonOffsetFactor:-2, polygonOffsetUnits:-8 }));
      this.floor.renderOrder = -5; this.floor.frustumCulled = false;
      this.themeGroup.add(this.floor);
    }

    const dk = DRIFT_KINDS[th.drift] || DRIFT_KINDS.motes;
    const N = Math.round(Math.min(420, th.driftN)*this.driftScale);
    const seeds = new Float32Array(N*4);
    for(let i=0;i<N*4;i++) seeds[i] = Math.random();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N*3), 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
    this.driftU = { uTime:{ value:0 }, uScale:this.poolUniforms.uScale, uNear0:this.poolUniforms.uNear0, uNear1:this.poolUniforms.uNear1,
      uSize:{ value:dk.size*th.driftSize }, uCenter:{ value:new THREE.Vector3() }, uBox:{ value:new THREE.Vector3(260, 130, 260) },
      uVel:{ value:new THREE.Vector3(...dk.vel) }, uWobble:{ value:new THREE.Vector3(...dk.wob) },
      uColor:{ value:new THREE.Color(th.driftCol) }, uKind:{ value:dk.kind }, uAlpha:{ value:dk.alpha } };
    this.drift = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms:this.driftU, vertexShader:DRIFT_VS, fragmentShader:DRIFT_FS,
      transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, fog:false }));
    this.drift.frustumCulled = false; this.drift.renderOrder = 4;
    this.themeGroup.add(this.drift);

    this.nextFw = 1.2; this.nextBolt = rnd(2, 5);
  }

  // ---- events (positions are plain numbers: no allocation) ----------------
  pulse(hex, amount){
    this._c.setHex(hex);
    this.flash.x = Math.min(1.2, this.flash.x + this._c.r*amount);
    this.flash.y = Math.min(1.2, this.flash.y + this._c.g*amount);
    this.flash.z = Math.min(1.2, this.flash.z + this._c.b*amount);
  }
  _fountain(x, y, z, n, colors, speed, life){
    const q = this.lowPower ? .6 : 1;
    n = Math.round(n*q);
    for(let i=0;i<n;i++){
      const th = Math.random()*TAU, r = rnd(.2, 1)*speed*.35;
      this._emit(x, y, z, Math.cos(th)*r, speed*rnd(.6, 1.1), Math.sin(th)*r, life*rnd(.7, 1.1), rnd(.5, .8),
        colors[i % colors.length], { drag:1.4, grav:16, near:1, tw:true });
    }
  }
  _radial(x, y, z, n, colors, speed, life, size, flat){
    const q = this.lowPower ? .6 : 1;
    n = Math.round(n*q);
    for(let i=0;i<n;i++){
      const u = flat ? rnd(-.15, .35) : Math.random()*2-1, th = Math.random()*TAU, r = Math.sqrt(Math.max(0, 1-u*u));
      const v = speed*rnd(.5, 1);
      this._emit(x, y, z, Math.cos(th)*r*v, u*v, Math.sin(th)*r*v, life*rnd(.6, 1), size*rnd(.7, 1.2),
        colors[i % colors.length], { drag:3, grav:4, near:1 });
    }
  }
  checkpoint(x, y, z){
    this._ring(x, y - .45, z, 0x55d8ff, 12, .8);
    this._ring(x, y - .45, z, 0x52ffbd, 18, 1.0, .12);
    this._fountain(x, y, z, 40, [0x55d8ff, 0x52ffbd, 0xffffff], 16, 1.1);
    this._queueShells(4, .7, [0x55d8ff, 0x52ffbd, 0xffffff, 0xb77dff]);
    this.pulse(0x55d8ff, .35);
  }
  switchOn(x, y, z){
    this._ring(x, y - .45, z, 0xff7a2a, 16, .7);
    this._ring(x, y - .45, z, 0xffd257, 26, 1.1, .1);
    this._radial(x, y - .3, z, 36, [0xff7a2a, 0xffd257, 0xffffff], 22, .7, .6, true);
    this._queueShells(2, .4, [0xff7a2a, 0xffd257, 0xff4a9a]);
    this.pulse(0xff8a3a, .4);
  }
  key(x, y, z){
    this._radial(x, y, z, 44, [0xffdb54, 0xfff2b0, 0xffffff], 14, .9, .55, false);
    this._ring(x, y - .45, z, 0xffdb54, 10, .6);
    this._queueShells(2, .5, [0xffdb54, 0xfff2b0, 0xffa040]);
    this.pulse(0xffdb54, .3);
  }
  launch(x, y, z){ this._radial(x, y - .4, z, 20, [0xffb13b, 0xff7628, 0xffffff], 14, .5, .5, true); }
  spring(x, y, z){ this._ring(x, y - .45, z, 0xffe040, 5, .4); }
  fall(x, y, z){
    // Explosion at the point of the fall: fireball, sparks, shockwave, red sky pulse.
    this._emit(x, y, z, 0, 0, 0, .35, 9, 0xfff0c0, { drag:0, grav:0, near:1, a:1 });
    this._radial(x, y, z, 70, [0xff3a1a, 0xff8a2a, 0xffd257, 0xffffff], 34, 1.0, .75, false);
    this._radial(x, y, z, 24, [0xff5a2a, 0xffa040], 10, 1.4, 1.6, false);
    this._ring(x, y, z, 0xff4a2a, 9, .6);
    this.pulse(0xff3a2a, .45);
  }
  finish(x, y, z){
    this._ring(x, y, z, 0x52ffbd, 20, 1.0);
    this._ring(x, y, z, 0xffd257, 30, 1.3, .15);
    this._fountain(x, y, z, 90, [0x52ffbd, 0xffd257, 0xffffff, 0xff7ad0, 0x5ad8ff], 22, 1.6);
    this._queueShells(10, 1.8, this.theme ? this.theme.fwPal : [0xffd257], 1.15);
    this.pulse(0x52ffbd, .5);
  }
  // Results celebration: 'gold' | 'silver' | 'bronze' | 'clear' | null
  celebrate(tier){ this.celebrateTier = tier; this.celebrateNext = .5; }

  // ---- per frame ----------------------------------------------------------
  update(dt, camera, focus, playing){
    dt = Math.min(dt, .1);
    this.time += dt;
    const t = this.time;
    const cam = camera.position;
    const h = this.renderer.domElement.height || 800;
    this.poolUniforms.uScale.value = h/(2*Math.tan(camera.fov*Math.PI/360));
    if(focus){
      const dx = cam.x-focus.x, dy = cam.y-focus.y, dz = cam.z-focus.z;
      const cd = Math.sqrt(dx*dx+dy*dy+dz*dz);
      this.poolUniforms.uNear0.value = cd*1.4;
      this.poolUniforms.uNear1.value = cd*2.4;
    }

    // flash decays toward zero
    const k = Math.exp(-dt*4);
    this.flash.multiplyScalar(k);

    const th = this.theme;
    if(th){
      if(this.dome){ this.dome.position.copy(cam); this.domeU.uTime.value = t; }
      if(this.floor){
        this.floor.position.set(cam.x, this.planeY + .6, cam.z);
        this.floorU.uTime.value = t; this.floorU.uCam.value.copy(cam);
      }
      if(this.drift){
        this.driftU.uTime.value = t;
        const c = this.driftU.uCenter.value;
        if(focus){
          camera.getWorldDirection(this._fwd); this._fwd.y = 0; this._fwd.normalize();
          c.set(focus.x + this._fwd.x*95, focus.y - 30, focus.z + this._fwd.z*95);
          if(this.planeY !== null) c.y = Math.max(c.y, this.planeY + 65);
        }
      }
      // Lightning: double-flicker at random intervals.
      if(th.lightning && playing){
        this.nextBolt -= dt;
        if(this.nextBolt <= 0){ this.boltStep = 3; this.boltT = 0; this.nextBolt = rnd(3.5, 8)/th.lightning; }
        if(this.boltStep > 0){
          this.boltT -= dt;
          if(this.boltT <= 0){
            if(this.boltStep === 3) this._bolt(camera, th.lightCol);
            this.pulse(th.lightCol, this.boltStep === 3 ? .3 : .18); this.boltStep--; this.boltT = rnd(.06, .16);
          }
        }
      }
      // Ambient fireworks during play.
      if(playing){
        this.nextFw -= dt;
        if(this.nextFw <= 0){
          this._queueShells(Math.random() < .25 ? 2 : 1, .5, th.fwPal);
          this.nextFw = th.fwEvery*(this.lowPower ? 1.35 : 1)*rnd(.6, 1.4);
        }
      }
      // Results celebration by medal tier.
      if(this.celebrateTier){
        this.celebrateNext -= dt;
        if(this.celebrateNext <= 0){
          const tier = this.celebrateTier;
          const pal = tier === 'gold' ? [0xffd257, 0xfff2b0, 0xff9a40, 0xffffff, 0xff7ad0]
                    : tier === 'silver' ? [0xdfe8ff, 0xffffff, 0x9ad8ff, 0xb7a0ff]
                    : tier === 'bronze' ? [0xe39a5c, 0xffb070, 0xffd8a0]
                    : th.fwPal;
          const every = tier === 'gold' ? .38 : tier === 'silver' ? .55 : tier === 'bronze' ? .85 : 1.3;
          this._queueShells(tier === 'gold' ? 2 : 1, .2, pal, tier === 'gold' ? 1.2 : 1);
          this.celebrateNext = every*(this.lowPower ? 1.4 : 1)*rnd(.7, 1.3);
        }
      }
      for(const q of this.queue){
        if(!q.on) continue;
        q.t -= dt;
        if(q.t <= 0){ q.on = false; this._launch(camera, q.pal, q.big); }
      }
    }
    this._stepShells(dt);
    this._stepPool(dt);
    this._stepRings(dt);
    this._stepBolts(dt);
  }

  get liveParticles(){ return this.n; }
}
