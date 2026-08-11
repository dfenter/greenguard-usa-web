import * as THREE from 'three';

function makeParticleTexture() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.35, 'rgba(255,238,190,.76)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makePool(root, max, color, size, texture, name) {
  const positions = new Float32Array(max * 3);
  const velocities = new Float32Array(max * 3);
  const life = new Float32Array(max);
  const maxLife = new Float32Array(max);
  for (let i = 0; i < max; i += 1) positions[i * 3 + 1] = -999;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color,
    size,
    map: texture,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  const points = new THREE.Points(geometry, material);
  points.name = name;
  root.add(points);
  return { positions, velocities, life, maxLife, geometry, material, points, cursor: 0, activeLimit: max, max };
}

function spawn(pool, position, velocity, duration, spread) {
  const index = pool.cursor;
  pool.cursor = (pool.cursor + 1) % pool.activeLimit;
  const p = index * 3;
  pool.positions[p] = position.x;
  pool.positions[p + 1] = position.y;
  pool.positions[p + 2] = position.z;
  pool.velocities[p] = velocity.x + (index % 3 - 1) * spread;
  pool.velocities[p + 1] = velocity.y + ((index * 7) % 5) * spread * 0.35;
  pool.velocities[p + 2] = velocity.z + ((index * 11) % 5 - 2) * spread;
  pool.life[index] = duration;
  pool.maxLife[index] = duration;
}

function updatePool(pool, dt, gravity) {
  const positions = pool.positions;
  const velocities = pool.velocities;
  let changed = false;
  for (let i = 0; i < pool.activeLimit; i += 1) {
    let remaining = pool.life[i];
    if (remaining <= 0) continue;
    remaining -= dt;
    pool.life[i] = remaining;
    const p = i * 3;
    if (remaining <= 0) {
      positions[p + 1] = -999;
      continue;
    }
    velocities[p + 1] += gravity * dt;
    positions[p] += velocities[p] * dt;
    positions[p + 1] += velocities[p + 1] * dt;
    positions[p + 2] += velocities[p + 2] * dt;
    changed = true;
  }
  if (changed) pool.geometry.attributes.position.needsUpdate = true;
}

export function createFX(options = {}) {
  const root = new THREE.Group();
  root.name = 'GGRacer pooled speed FX';
  const texture = makeParticleTexture();
  const dust = makePool(root, 96, 0xd49d5c, 0.72, texture, 'pooled dust and exhaust');
  const sparks = makePool(root, 64, 0xffd26a, 0.46, texture, 'pooled sparks');
  const streakCount = 28;
  const streakPositions = new Float32Array(streakCount * 2 * 3);
  const streakOffsets = new Float32Array(streakCount * 3);
  for (let i = 0; i < streakCount; i += 1) {
    streakOffsets[i * 3] = (i % 7 - 3) * 0.74;
    streakOffsets[i * 3 + 1] = 0.04 + (i % 4) * 0.035;
    streakOffsets[i * 3 + 2] = ((i * 17) % 23) * 0.9;
  }
  const streakGeometry = new THREE.BufferGeometry();
  streakGeometry.setAttribute('position', new THREE.BufferAttribute(streakPositions, 3));
  const streakMaterial = new THREE.LineBasicMaterial({ color: 0xdffbff, transparent: true, opacity: 0.3, depthWrite: false });
  const streaks = new THREE.LineSegments(streakGeometry, streakMaterial);
  streaks.name = 'near-ground speed streaks';
  streaks.visible = false;
  root.add(streaks);

  const skidMaterial = new THREE.MeshBasicMaterial({ color: 0x101216, transparent: true, opacity: 0.38, depthWrite: false });
  const skidGeometry = new THREE.PlaneGeometry(0.3, 1.65);
  const skids = new Array(28);
  for (let i = 0; i < skids.length; i += 1) {
    const skid = new THREE.Mesh(skidGeometry, skidMaterial);
    skid.rotation.x = -Math.PI * 0.5;
    skid.visible = false;
    skid.name = 'pooled skid mark';
    root.add(skid);
    skids[i] = skid;
  }

  const juice = options.juice || null;
  let reducedMotion = options.reducedMotion === true;
  let skidCursor = 0;
  let dustAccumulator = 0;
  let streakPhase = 0;
  let activeTier = 2;
  const carPosition = new THREE.Vector3();
  const dustPosition = new THREE.Vector3();
  const exhaustPosition = new THREE.Vector3();
  const localVelocity = new THREE.Vector3();

  function enabled() {
    return !reducedMotion && (!juice || juice.enabled !== false);
  }

  function updateStreaks(position, speed, dt) {
    const show = enabled() && speed > 14;
    streaks.visible = show;
    if (!show) return;
    streakPhase += speed * dt * 0.18;
    for (let i = 0; i < streakCount; i += 1) {
      const source = i * 3;
      const target = i * 6;
      const z = ((streakOffsets[source + 2] + streakPhase) % 22) - 11;
      const x = position.x + streakOffsets[source];
      const y = position.y + streakOffsets[source + 1];
      streakPositions[target] = x;
      streakPositions[target + 1] = y;
      streakPositions[target + 2] = position.z + z;
      streakPositions[target + 3] = x;
      streakPositions[target + 4] = y;
      streakPositions[target + 5] = position.z + z - 1.4 - speed * 0.04;
    }
    streakGeometry.attributes.position.needsUpdate = true;
    streakMaterial.opacity = Math.min(0.54, 0.16 + speed * 0.008);
  }

  function update(dt, state, car) {
    const speed = Math.abs(Number(state.speed) || 0);
    car.root.getWorldPosition(carPosition);
    updateStreaks(carPosition, speed, dt);
    if (enabled()) {
      car.anchors.dust.getWorldPosition(dustPosition);
      car.anchors.exhaust.getWorldPosition(exhaustPosition);
      dustAccumulator += dt * Math.min(18, 2 + speed * 0.42);
      localVelocity.set(0, 0.2 + speed * 0.015, -speed * 0.12).applyQuaternion(car.root.quaternion);
      while (dustAccumulator >= 1) {
        dustAccumulator -= 1;
        spawn(dust, dustPosition, localVelocity, 0.54 + (dust.cursor % 4) * 0.07, 0.12);
      }
      if (Number(state.boost) > 0.5 && speed > 20) {
        spawn(sparks, exhaustPosition, localVelocity, 0.18, 0.28);
      }
    }
    updatePool(dust, dt, -0.4);
    updatePool(sparks, dt, -2.1);
  }

  function spawnDust(position, velocity) {
    if (enabled()) spawn(dust, position, velocity, 0.62, 0.16);
  }

  function spawnSpark(position, velocity) {
    if (enabled()) spawn(sparks, position, velocity, 0.24, 0.24);
  }

  function spawnSkid(position, yaw) {
    if (!enabled()) return;
    const skid = skids[skidCursor];
    skidCursor = (skidCursor + 1) % skids.length;
    skid.position.copy(position);
    skid.position.y += 0.045;
    skid.rotation.y = yaw;
    skid.visible = true;
  }

  function impact(magnitude = 5) {
    if (!enabled()) return;
    if (juice && juice.hitStop) juice.hitStop(52);
    if (juice && juice.shake) juice.shake(Math.min(14, magnitude), 180);
  }

  function setQuality(tier) {
    activeTier = Math.max(0, Math.min(2, Number(tier) || 0));
    const factor = [0.42, 0.7, 1][activeTier];
    dust.activeLimit = Math.max(12, Math.floor(dust.max * factor));
    sparks.activeLimit = Math.max(10, Math.floor(sparks.max * factor));
    streaks.visible = false;
  }

  function setReducedMotion(value) {
    reducedMotion = !!value;
    if (reducedMotion) {
      streaks.visible = false;
      for (let i = 0; i < skids.length; i += 1) skids[i].visible = false;
    }
  }

  function dispose() {
    root.traverse((object) => {
      if (object.geometry) object.geometry.dispose();
      if (object.material) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => {
          if (material.map) material.map.dispose();
          material.dispose();
        });
      }
    });
  }

  setQuality(2);
  return {
    root,
    update,
    spawnDust,
    spawnSpark,
    spawnSkid,
    impact,
    setQuality,
    setReducedMotion,
    dispose,
  };
}

export const FX_BUDGET = {
  reducedMotionGate: 'GGKit.juice.enabled',
  pools: { dust: 96, sparks: 64, skidMarks: 28, streakSegments: 28 },
};
