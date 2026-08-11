import * as THREE from 'three';
import { createTrack } from './track.js';
import { createEnvironment } from './env.js';
import { createGTCar } from './carkit.js';
import { createFX } from './fx.js';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function createQualityScaler(onTierChange) {
  const samples = new Float32Array(32);
  let sampleCount = 0;
  let sampleCursor = 0;
  let total = 0;
  let tier = 2;
  let cooldown = 0;
  return {
    get tier() { return tier; },
    sample(milliseconds) {
      const value = clamp(Number(milliseconds) || 0, 0, 100);
      if (sampleCount < samples.length) {
        samples[sampleCount] = value;
        sampleCount += 1;
        total += value;
      } else {
        total += value - samples[sampleCursor];
        samples[sampleCursor] = value;
        sampleCursor = (sampleCursor + 1) % samples.length;
      }
      cooldown -= 1;
      if (sampleCount < samples.length || cooldown > 0) return tier;
      const average = total / samples.length;
      let next = tier;
      if (average > 18.5 && tier > 0) next = tier - 1;
      else if (average < 13.8 && tier < 2) next = tier + 1;
      if (next !== tier) {
        tier = next;
        cooldown = 48;
        onTierChange(tier);
      }
      return tier;
    },
    set(tierValue) {
      const next = clamp(Number(tierValue) || 0, 0, 2);
      if (next !== tier) {
        tier = next;
        onTierChange(tier);
      }
    },
  };
}

function isPosition(value) {
  return value && typeof value.x === 'number' && typeof value.z === 'number';
}

function makeState() {
  return {
    position: new THREE.Vector3(),
    yaw: 0,
    speed: 0,
    steering: 0,
    acceleration: 0,
    lateralG: 0,
    suspension: 0,
    pitch: 0,
    roll: 0,
    brake: 0,
    boost: 0,
    progress: 0,
  };
}

function copyState(source, target, track, frame) {
  const sourceState = source || {};
  if (isPosition(sourceState.position)) {
    target.position.x = sourceState.position.x;
    target.position.y = Number(sourceState.position.y) || 0;
    target.position.z = sourceState.position.z;
    target.progress = Number(sourceState.progress) || 0;
  } else {
    target.progress = Number(sourceState.progress) || 0;
    track.sampleRacingLine(target.progress, frame);
    target.position.copy(frame.position);
  }
  target.yaw = Number(sourceState.yaw);
  if (!Number.isFinite(target.yaw)) target.yaw = Math.atan2(frame.tangent.x, frame.tangent.z);
  target.speed = Number(sourceState.speed) || 0;
  target.steering = Number(sourceState.steering) || 0;
  target.acceleration = Number(sourceState.acceleration) || 0;
  target.lateralG = Number(sourceState.lateralG) || 0;
  target.suspension = Number(sourceState.suspension) || 0;
  target.pitch = Number(sourceState.pitch) || 0;
  target.roll = Number(sourceState.roll) || 0;
  target.brake = Number(sourceState.brake) || 0;
  target.boost = Number(sourceState.boost) || 0;
  return target;
}

function themeLighting(theme, timeOfDay) {
  const night = theme === 'night-city' || timeOfDay === 'night';
  return night ? {
    hemiSky: 0x7f9de0, hemiGround: 0x1e2940, hemiIntensity: 0.78,
    sun: 0xb5d1ff, sunIntensity: 0.82, sunPosition: [-0.45, 0.72, -0.55],
  } : {
    hemiSky: 0xffd1a0, hemiGround: 0x3d2c24, hemiIntensity: 1.0,
    sun: 0xffe2b8, sunIntensity: 1.7, sunPosition: [-0.55, 0.78, 0.42],
  };
}

export function createRacerWorld(options = {}) {
  const canvas = options.canvas;
  if (!canvas) throw new Error('createRacerWorld requires a canvas');
  const theme = options.theme || 'desert';
  const timeOfDay = options.timeOfDay || (theme === 'night-city' ? 'night' : 'dusk');
  const track = createTrack(options.trackJSON, {
    roadColor: theme === 'night-city' ? 0xd7dde7 : 0xffffff,
    roadEmissive: theme === 'night-city' ? 0x121b2c : 0x000000,
    roadEmissiveIntensity: theme === 'night-city' ? 0.2 : 0,
    gateColor: theme === 'night-city' ? 0x5de9ef : 0xe8b54d,
    sectorColor: theme === 'night-city' ? 0x6a96ff : 0x75c9cf,
    barrierPalette: theme === 'night-city'
      ? { post: 0x29364e, rail: 0x65bdc7 }
      : { post: 0xc5ae88, rail: 0x704735 },
  });
  const environment = createEnvironment(track, { theme, seed: options.seed, qualityTier: 2 });
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(environment.fog.color);
  scene.fog = new THREE.Fog(environment.fog.color, environment.fog.near, environment.fog.far);
  scene.add(environment.root);
  scene.add(track.root);

  const lights = themeLighting(theme, timeOfDay);
  const hemi = new THREE.HemisphereLight(lights.hemiSky, lights.hemiGround, lights.hemiIntensity);
  hemi.name = 'hemisphere ambient fill';
  const sun = new THREE.DirectionalLight(lights.sun, lights.sunIntensity);
  sun.position.set(lights.sunPosition[0] * 120, lights.sunPosition[1] * 120, lights.sunPosition[2] * 120);
  sun.name = 'single directional key light';
  scene.add(hemi, sun);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = theme === 'night-city' ? 1.24 : 1.08;
  renderer.shadowMap.enabled = false;

  const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 1200);
  camera.name = 'low chase camera';
  const cameraDesired = new THREE.Vector3();
  const cameraLook = new THREE.Vector3();
  const cameraFrame = new THREE.Vector3();
  const cameraLookFrame = new THREE.Vector3();
  const trackFrame = { position: new THREE.Vector3(), tangent: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3() };
  const mainState = makeState();
  const fallbackFrame = { carState: mainState, rivals: [] };
  const mainCar = createGTCar({
    name: options.carName || 'player GT-bar',
    paint: options.paint || 0xd44738,
    accent: options.accent || 0xf2c34e,
    night: theme === 'night-city',
  });
  scene.add(mainCar.root);
  const rivals = [];
  const rivalStates = [];
  const rivalPaints = [0x2b69d1, 0x49b878, 0xe3b53d, 0xa74fd4];
  const rivalCount = Math.max(0, Math.floor(Number(options.rivalCount ?? 1)));
  for (let i = 0; i < rivalCount; i += 1) {
    const car = createGTCar({
      name: `AI rival ${i + 1}`,
      paint: rivalPaints[i % rivalPaints.length],
      accent: 0xf2e8d0,
      scale: 0.97,
      night: theme === 'night-city',
    });
    scene.add(car.root);
    rivals.push(car);
    rivalStates.push(makeState());
  }
  const fx = createFX({ juice: options.ggkit ? options.ggkit.juice : null, reducedMotion: options.reducedMotion });
  scene.add(fx.root);

  const cameraApi = {
    object: camera,
    mode: 'chase',
    setMode(mode) { cameraApi.mode = mode === 'chase' ? 'chase' : 'chase'; },
    snapToCar() {
      camera.position.copy(cameraDesired);
      camera.lookAt(cameraLook);
    },
  };

  function updateCamera(state, dt) {
    const response = 1 - Math.exp(-dt * 6.4);
    cameraFrame.set(0, 3.35, -8.7).applyQuaternion(mainCar.root.quaternion).add(mainCar.root.position);
    cameraLookFrame.set(0, 1.12, 6.4).applyQuaternion(mainCar.root.quaternion).add(mainCar.root.position);
    cameraDesired.lerp(cameraFrame, response);
    cameraLook.lerp(cameraLookFrame, response);
    camera.position.lerp(cameraDesired, 0.68);
    const speedFov = clamp(Math.abs(state.speed) / 46, 0, 1) * 5;
    const wantedFov = 58 + speedFov;
    if (Math.abs(camera.fov - wantedFov) > 0.02) {
      camera.fov += (wantedFov - camera.fov) * Math.min(1, dt * 8);
      camera.updateProjectionMatrix();
    }
    camera.lookAt(cameraLook);
    // Roll about the local view axis. Writing camera.rotation.z after lookAt
    // flips the view 180 degrees whenever lookAt lands on the flipped Euler
    // representation (x~pi, z~pi), which is half of all headings.
    camera.rotateZ(clamp(-Number(state.steering) * 0.025 - Number(state.roll) * 0.18, -0.045, 0.045));
  }

  let paused = false;
  let running = false;
  let animationFrame = 0;
  let lastTime = 0;
  let frameProvider = null;
  const quality = createQualityScaler((tier) => {
    environment.setQuality(tier);
    fx.setQuality(tier);
    mainCar.setQuality(tier);
    for (let i = 0; i < rivals.length; i += 1) rivals[i].setQuality(tier);
  });

  function update(frame = fallbackFrame, dt = 1 / 60) {
    if (paused) return;
    const safeDt = clamp(Number(dt) || 1 / 60, 0, 0.05);
    const sourceCarState = frame.carState || frame.player || frame;
    copyState(sourceCarState, mainState, track, trackFrame);
    mainCar.update(mainState, safeDt);
    const sourceRivals = Array.isArray(frame.rivals) ? frame.rivals : [];
    for (let i = 0; i < rivals.length; i += 1) {
      const source = sourceRivals[i] || { progress: (mainState.progress + 0.035 + i * 0.05) % 1, speed: mainState.speed * 0.96 };
      const rivalFrame = trackFrame;
      copyState(source, rivalStates[i], track, rivalFrame);
      rivals[i].update(rivalStates[i], safeDt);
    }
    updateCamera(mainState, safeDt);
    fx.update(safeDt, mainState, mainCar);
    quality.sample(safeDt * 1000);
  }

  function render() {
    renderer.render(scene, camera);
  }

  function resize() {
    const width = canvas.clientWidth || window.innerWidth || 390;
    const height = canvas.clientHeight || window.innerHeight || 220;
    if (canvas.width !== Math.floor(width * renderer.getPixelRatio()) || canvas.height !== Math.floor(height * renderer.getPixelRatio())) {
      renderer.setSize(width, height, false);
    }
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
  }

  function loop(now) {
    if (!running) return;
    const dt = lastTime ? Math.min(0.05, (now - lastTime) / 1000) : 1 / 60;
    lastTime = now;
    const frame = frameProvider ? frameProvider(dt) : fallbackFrame;
    update(frame, dt);
    render();
    animationFrame = requestAnimationFrame(loop);
  }

  function start(provider) {
    if (running) return;
    frameProvider = provider || null;
    running = true;
    lastTime = 0;
    resize();
    animationFrame = requestAnimationFrame(loop);
  }

  function stop() {
    running = false;
    if (animationFrame) cancelAnimationFrame(animationFrame);
    animationFrame = 0;
  }

  function setPaused(value) { paused = !!value; }

  function dispose() {
    stop();
    fx.dispose();
    mainCar.dispose();
    for (let i = 0; i < rivals.length; i += 1) rivals[i].dispose();
    track.dispose();
    environment.dispose();
    renderer.dispose();
  }

  resize();
  track.sampleAt(0, trackFrame);
  mainState.position.copy(trackFrame.position);
  mainState.yaw = Math.atan2(trackFrame.tangent.x, trackFrame.tangent.z);
  mainCar.update(mainState, 0);
  updateCamera(mainState, 1 / 60);
  cameraApi.snapToCar();

  return {
    world: {
      scene,
      renderer,
      camera,
      track,
      environment,
      mainCar,
      rivals,
      fx,
      update,
      render,
      start,
      stop,
      resize,
      setPaused,
      dispose,
    },
    camera: cameraApi,
    trackQueries: {
      closestPoint: track.closestPoint,
      isOffroad: track.isOffroad,
      getSector: track.getSector,
      checkpoint: track.checkpoint,
      sampleRacingLine: track.sampleRacingLine,
    },
    minimap: track.exportMinimap(),
    exportMinimap: track.exportMinimap,
    quality,
  };
}

export const QUALITY_TIERS = {
  0: { name: 'low', dressing: 0.38, shadows: false, streaks: false },
  1: { name: 'balanced', dressing: 0.68, shadows: 'blob', streaks: true },
  2: { name: 'showcase', dressing: 1, shadows: 'blob', streaks: true },
};
