(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  const WORLD_W = 3340;
  const GROUND_Y = 548;
  const TAU = Math.PI * 2;
  const BEST_KEY = 'vertol-rescue-best';

  let vw = 960;
  let vh = 540;
  let pixelRatio = 1;
  let cameraX = 0;
  let lastTime = performance.now();

  const input = {
    stickX: 0,
    stickY: 0,
    stickId: null,
    lever: 0.46,
    leverId: null,
    keys: new Set()
  };

  const buildingData = [
    { x: 590, w: 174, h: 130, hue: 218 },
    { x: 855, w: 132, h: 84, hue: 202 },
    { x: 1025, w: 215, h: 92, hue: 225 },
    { x: 1192, w: 188, h: 166, hue: 210 },
    { x: 1420, w: 110, h: 70, hue: 235 },
    { x: 1682, w: 228, h: 121, hue: 220 },
    { x: 1985, w: 185, h: 202, hue: 205 },
    { x: 2715, w: 146, h: 72, hue: 226 },
    { x: 2868, w: 205, h: 142, hue: 214 },
    { x: 3130, w: 122, h: 100, hue: 231 }
  ];

  const ledgeData = [
    { x: 405, w: 205, y: 475 },
    { x: 1515, w: 185, y: 442 },
    { x: 2580, w: 132, y: 497 }
  ];

  const survivorData = [
    { id: 0, name: 'Ari', x: 488, y: 451, color: '#ffbf69', kind: 'ledge' },
    { id: 1, name: 'Bo', x: 676, y: 389, color: '#8ee3ef', kind: 'roof' },
    { id: 2, name: 'Cleo', x: 952, y: 433, color: '#f7aef8', kind: 'roof' },
    { id: 3, name: 'Dax', x: 1286, y: 357, color: '#a7f3a1', kind: 'roof' },
    { id: 4, name: 'Eli', x: 1600, y: 417, color: '#ffd166', kind: 'ledge' },
    { id: 5, name: 'Fia', x: 2075, y: 323, color: '#ff9f9f', kind: 'roof' },
    { id: 6, name: 'Gio', x: 2385, y: 430, color: '#92b6ff', kind: 'boat' },
    { id: 7, name: 'Hana', x: 2965, y: 383, color: '#d0a8ff', kind: 'roof' }
  ];

  const farBlocks = [];
  let farSeed = 17;
  function randomFar() {
    farSeed = (farSeed * 1664525 + 1013904223) >>> 0;
    return farSeed / 4294967296;
  }
  for (let x = -120; x < WORLD_W + 500; x += 54 + randomFar() * 60) {
    farBlocks.push({ x, w: 32 + randomFar() * 62, h: 40 + randomFar() * 105 });
  }

  const surfaces = [
    { x: 0, w: 340, y: GROUND_Y, type: 'pad' },
    ...buildingData.map((b) => ({ x: b.x, w: b.w, y: GROUND_Y - b.h, type: 'roof' })),
    ...ledgeData.map((p) => ({ x: p.x, w: p.w, y: p.y, type: 'ledge' })),
    { x: 2315, w: 258, y: 462, type: 'boat' }
  ];

  let bestScore = 0;
  try { bestScore = Number(localStorage.getItem(BEST_KEY)) || 0; } catch (_) {}

  const state = {
    mode: 'playing',
    reason: '',
    time: 0,
    x: 170,
    y: 255,
    vx: 0,
    vy: 0,
    angle: 0,
    angleVelocity: 0,
    fuel: 100,
    cameraShake: 0,
    wind: 0,
    gust: 0,
    gustTimer: 4.2,
    cableLength: 128,
    cableTarget: 128,
    cableAngle: 0.02,
    cableAngularVelocity: 0,
    hooked: null,
    onboard: [],
    delivered: 0,
    particles: [],
    survivors: []
  };

  function resetGame() {
    input.stickX = 0;
    input.stickY = 0;
    input.stickId = null;
    input.lever = 0.46;
    input.leverId = null;
    input.keys.clear();
    state.mode = 'playing';
    state.reason = '';
    state.time = 0;
    state.x = 170;
    state.y = 255;
    state.vx = 0;
    state.vy = 0;
    state.angle = 0;
    state.angleVelocity = 0;
    state.fuel = 100;
    state.cameraShake = 0;
    state.wind = 0;
    state.gust = 0;
    state.gustTimer = 4.2;
    state.cableLength = 128;
    state.cableTarget = 128;
    state.cableAngle = 0.02;
    state.cableAngularVelocity = 0;
    state.hooked = null;
    state.onboard = [];
    state.delivered = 0;
    state.particles = [];
    state.survivors = survivorData.map((survivor) => ({ ...survivor, status: 'waiting' }));
  }

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smoothTo(a, b, speed, dt) { return lerp(a, b, 1 - Math.exp(-speed * dt)); }
  function rr(x, y, w, h, radius) {
    const r = Math.min(radius, Math.abs(w) * 0.5, Math.abs(h) * 0.5);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function roundedFill(x, y, w, h, radius, fill) {
    ctx.fillStyle = fill;
    rr(x, y, w, h, radius);
    ctx.fill();
  }
  function text(str, x, y, size, color, align = 'left', weight = 700) {
    ctx.font = `${weight} ${size}px Arial, Helvetica, sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }
  function scoreNow() { return state.delivered * 100 + state.onboard.length * 25; }
  function saveBest(score) {
    if (score > bestScore) {
      bestScore = score;
      try { localStorage.setItem(BEST_KEY, String(bestScore)); } catch (_) {}
    }
  }

  function resize() {
    vw = Math.max(1, window.innerWidth);
    vh = Math.max(1, window.innerHeight);
    const longAxis = Math.max(vw, vh);
    pixelRatio = Math.min(window.devicePixelRatio || 1, 2, 960 / longAxis);
    canvas.width = Math.max(1, Math.floor(vw * pixelRatio));
    canvas.height = Math.max(1, Math.floor(vh * pixelRatio));
    canvas.style.width = `${vw}px`;
    canvas.style.height = `${vh}px`;
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  }

  function getStickBase() { return { x: Math.min(112, vw * 0.18), y: vh - 92, radius: 67 }; }
  function getLeverBounds() {
    const top = Math.max(92, vh * 0.19);
    const bottom = Math.min(vh - 94, vh * 0.82);
    return { x: vw - Math.min(86, vw * 0.12), top, bottom };
  }
  function setStick(clientX, clientY) {
    const base = getStickBase();
    const dx = clientX - base.x;
    const dy = clientY - base.y;
    const distance = Math.hypot(dx, dy) || 1;
    const radius = base.radius;
    const scale = Math.min(1, radius / distance);
    input.stickX = clamp((dx * scale) / radius, -1, 1);
    input.stickY = clamp((-dy * scale) / radius, -1, 1);
  }
  function setLever(clientY) {
    const bounds = getLeverBounds();
    input.lever = clamp((clientY - bounds.top) / Math.max(1, bounds.bottom - bounds.top), 0, 1);
    state.cableTarget = 42 + input.lever * 182;
  }

  function portraitMode() { return vw < vh * 0.96; }

  function pointerDown(event) {
    event.preventDefault();
    if (portraitMode()) return;
    if (state.mode !== 'playing') {
      resetGame();
      return;
    }
    const x = event.clientX;
    const y = event.clientY;
    if (x < vw * 0.46 && y > vh * 0.48) {
      if (input.stickId !== null) return;
      input.stickId = event.pointerId;
      setStick(x, y);
      canvas.setPointerCapture?.(event.pointerId);
    } else if (x > vw * 0.66) {
      if (input.leverId !== null) return;
      input.leverId = event.pointerId;
      setLever(y);
      canvas.setPointerCapture?.(event.pointerId);
    }
  }
  function pointerMove(event) {
    event.preventDefault();
    if (event.pointerId === input.stickId) setStick(event.clientX, event.clientY);
    if (event.pointerId === input.leverId) setLever(event.clientY);
  }
  function pointerUp(event) {
    event.preventDefault();
    if (event.pointerId === input.stickId) {
      input.stickId = null;
      input.stickX = 0;
      input.stickY = 0;
    }
    if (event.pointerId === input.leverId) input.leverId = null;
  }

  function keyChange(event, down) {
    const code = event.code;
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'Space', 'Enter', 'KeyR'].includes(code)) {
      event.preventDefault();
    }
    if (down && (code === 'Space' || code === 'Enter' || code === 'KeyR') && state.mode !== 'playing') {
      resetGame();
      return;
    }
    if (down) input.keys.add(code); else input.keys.delete(code);
  }

  function keyDown(code) { return input.keys.has(code); }
  function horizontalInput() {
    return clamp(input.stickX + (keyDown('KeyD') ? 1 : 0) - (keyDown('KeyA') ? 1 : 0), -1, 1);
  }
  function verticalInput() {
    return clamp(input.stickY + (keyDown('KeyW') ? 1 : 0) - (keyDown('KeyS') ? 1 : 0), -1, 1);
  }
  function adjustWinch(dt) {
    if (keyDown('ArrowDown')) state.cableTarget += 180 * dt;
    if (keyDown('ArrowUp')) state.cableTarget -= 180 * dt;
    state.cableTarget = clamp(state.cableTarget, 42, 224);
    input.lever = (state.cableTarget - 42) / 182;
  }

  function surfaceAt(x) {
    let surface = { y: GROUND_Y, type: 'ground' };
    for (const candidate of surfaces) {
      if (x >= candidate.x && x <= candidate.x + candidate.w && candidate.y < surface.y) surface = candidate;
    }
    if (x >= 2315 && x <= 2573) {
      const boatY = getBoatY();
      if (boatY < surface.y) surface = { y: boatY, type: 'boat' };
    }
    return surface;
  }
  function getBoatY() { return 462 + Math.min(34, state.time * 0.8) + Math.sin(state.time * 2.4) * 4; }
  function isPadLanding() { return state.x > 56 && state.x < 296 && state.y > 465 && Math.abs(state.vx) < 135; }

  function addParticles(x, y, color, count, speed = 90) {
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * TAU;
      const velocity = speed * (0.3 + Math.random() * 0.8);
      state.particles.push({
        x, y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        life: 0.35 + Math.random() * 0.55,
        maxLife: 0.9,
        size: 2 + Math.random() * 4,
        color
      });
      if (state.particles.length > 240) state.particles.shift();
    }
  }

  function hookPoint() {
    return {
      x: state.x + Math.sin(state.cableAngle) * state.cableLength,
      y: state.y + 24 + Math.cos(state.cableAngle) * state.cableLength
    };
  }

  function update(dt) {
    if (portraitMode()) return;
    if (state.mode !== 'playing') {
      state.cameraShake = Math.max(0, state.cameraShake - dt * 1.9);
      updateParticles(dt);
      return;
    }

    state.time += dt;
    state.gustTimer -= dt;
    if (state.gustTimer <= 0) {
      state.gust = (Math.random() * 2 - 1) * (28 + Math.random() * 26);
      state.gustTimer = 5.5 + Math.random() * 5;
    }
    state.gust = smoothTo(state.gust, 0, 0.12, dt);
    state.wind = Math.sin(state.time * 0.47) * 12 + Math.sin(state.time * 0.19 + 1.4) * 7 + state.gust;

    const lateral = horizontalInput();
    const collective = verticalInput();
    const mass = 1 + state.onboard.length * 0.15;
    const lift = Math.max(0, collective);
    state.vx += (lateral * 230 / mass + state.wind * 0.42) * dt;
    state.vx *= Math.pow(0.085, dt);
    state.vy += (48 - lift * 255 / mass) * dt;
    if (collective < 0) state.vy += Math.abs(collective) * 105 * dt;
    state.vy *= Math.pow(0.24, dt);
    state.x += state.vx * dt;
    state.y += state.vy * dt;
    state.x = clamp(state.x, 34, WORLD_W - 28);
    state.y = Math.max(25, state.y);
    const targetAngle = clamp(lateral * 0.42 - state.vx * 0.00035, -0.5, 0.5);
    state.angle = smoothTo(state.angle, targetAngle, 7, dt);
    state.angleVelocity = (targetAngle - state.angle) * 4;

    adjustWinch(dt);
    state.cableLength = smoothTo(state.cableLength, state.cableTarget, 8, dt);
    const pendulumForce = -Math.sin(state.cableAngle) * 2.4 - state.cableAngularVelocity * 1.65;
    state.cableAngularVelocity += (pendulumForce + state.vx * 0.0015 + state.wind * 0.0009) * dt;
    state.cableAngularVelocity *= Math.pow(0.34, dt);
    state.cableAngle += state.cableAngularVelocity * dt;
    state.cableAngle = clamp(state.cableAngle, -0.92, 0.92);

    const engineBurn = 0.42 + Math.max(0, collective) * 1.42 + Math.abs(lateral) * 0.22 + state.onboard.length * 0.08;
    state.fuel -= engineBurn * dt;
    const pad = isPadLanding() && state.y > 490 && Math.abs(state.vy) < 100;
    if (pad) {
      state.fuel = Math.min(100, state.fuel + 24 * dt);
      if (state.onboard.length > 0 && state.cableLength < 88) {
        const amount = state.onboard.length;
        state.delivered += amount;
        state.onboard = [];
        state.cameraShake = 0.18;
        addParticles(state.x, state.y + 35, '#73f2ba', 18, 130);
        if (state.delivered >= survivorData.length) finishGame();
      }
    }

    if (state.fuel <= 0) { crash('FUEL EMPTY'); return; }
    const surface = surfaceAt(state.x);
    if (state.y + 18 >= surface.y) {
      if (isPadLanding() && state.vy < 180) {
        state.y = surface.y - 18;
        state.vy = 0;
        state.vx *= 0.86;
      } else {
        crash('HULL COLLISION');
        return;
      }
    }

    const hook = hookPoint();
    if (state.hooked === null && state.cableLength > 68) {
      let closest = null;
      let closestDistance = 999;
      for (const survivor of state.survivors) {
        if (survivor.status !== 'waiting') continue;
        const distance = Math.hypot(hook.x - survivor.x, hook.y - survivor.y);
        if (distance < 34 && distance < closestDistance) {
          closest = survivor;
          closestDistance = distance;
        }
      }
      if (closest) {
        state.hooked = closest.id;
        closest.status = 'hooked';
        addParticles(hook.x, hook.y, '#ffe082', 14, 80);
        state.cameraShake = 0.12;
      }
    }
    if (state.hooked !== null) {
      const passenger = state.survivors.find((survivor) => survivor.id === state.hooked);
      if (passenger) {
        passenger.x = hook.x;
        passenger.y = hook.y - 18;
        if (state.cableLength < 62) {
          passenger.status = 'aboard';
          state.onboard.push(passenger.id);
          state.hooked = null;
          addParticles(state.x, state.y + 25, passenger.color, 13, 95);
          state.cameraShake = 0.12;
        }
      } else {
        state.hooked = null;
      }
    }
    updateParticles(dt);
    cameraX = smoothTo(cameraX, clamp(state.x - vw * 0.31, 0, Math.max(0, WORLD_W - vw)), 3.8, dt);
  }

  function updateParticles(dt) {
    for (const particle of state.particles) {
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 90 * dt;
    }
    state.particles = state.particles.filter((particle) => particle.life > 0);
  }

  function finishGame() {
    state.mode = 'won';
    state.reason = 'ALL SURVIVORS HOME';
    const finalScore = Math.max(0, state.delivered * 100 + Math.floor(600 - state.time * 5));
    saveBest(finalScore);
    addParticles(state.x, state.y, '#73f2ba', 38, 160);
  }

  function crash(reason) {
    state.mode = 'crashed';
    state.reason = reason;
    state.cameraShake = 0.8;
    addParticles(state.x, state.y, '#ff6b6b', 34, 180);
    saveBest(scoreNow());
  }

  function drawBackground() {
    const sky = ctx.createLinearGradient(0, 0, 0, vh);
    sky.addColorStop(0, '#0d1527');
    sky.addColorStop(0.56, '#16324a');
    sky.addColorStop(1, '#2b4f5a');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, vw, vh);

    ctx.globalAlpha = 0.55;
    ctx.fillStyle = '#d8f5ed';
    for (let i = 0; i < 28; i += 1) {
      const sx = ((i * 149 + 53) % Math.max(1, vw + 120)) - 60;
      const sy = 46 + ((i * 71) % Math.max(70, Math.floor(vh * 0.42)));
      ctx.fillRect(sx, sy, 2, 2);
    }
    ctx.globalAlpha = 1;

    ctx.save();
    ctx.translate(-cameraX * 0.12, 0);
    ctx.fillStyle = '#17283b';
    ctx.beginPath();
    ctx.moveTo(-200, vh * 0.64);
    for (let x = -200; x < WORLD_W + 700; x += 120) {
      ctx.lineTo(x, vh * 0.64 - 30 - Math.sin(x * 0.009) * 42);
    }
    ctx.lineTo(WORLD_W + 700, vh);
    ctx.lineTo(-200, vh);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#1c3548';
    for (const block of farBlocks) {
      ctx.fillRect(block.x, GROUND_Y - block.h - 45, block.w, block.h);
      ctx.fillStyle = 'rgba(117, 190, 201, .12)';
      for (let row = 0; row < 3; row += 1) {
        ctx.fillRect(block.x + 8, GROUND_Y - block.h - 25 + row * 16, 4, 4);
        ctx.fillRect(block.x + block.w - 14, GROUND_Y - block.h - 25 + row * 16, 4, 4);
      }
      ctx.fillStyle = '#1c3548';
    }
    ctx.restore();
  }

  function drawWorld() {
    ctx.save();
    ctx.translate(-cameraX, 0);

    ctx.fillStyle = '#102332';
    ctx.fillRect(0, GROUND_Y, WORLD_W, vh - GROUND_Y + 20);
    ctx.fillStyle = '#143a49';
    ctx.fillRect(2140, 510, 540, vh - 490);
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = '#8ce2dc';
    ctx.lineWidth = 2;
    for (let y = 530; y < vh + 20; y += 22) {
      ctx.beginPath();
      ctx.moveTo(2110, y);
      ctx.quadraticCurveTo(2370, y - 10, 2670, y + 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    for (const building of buildingData) {
      const top = GROUND_Y - building.h;
      const buildingGradient = ctx.createLinearGradient(0, top, 0, GROUND_Y);
      buildingGradient.addColorStop(0, `hsl(${building.hue}, 28%, 29%)`);
      buildingGradient.addColorStop(1, `hsl(${building.hue}, 30%, 17%)`);
      ctx.fillStyle = buildingGradient;
      ctx.fillRect(building.x, top, building.w, building.h);
      ctx.fillStyle = 'rgba(156, 226, 218, .42)';
      for (let wx = building.x + 14; wx < building.x + building.w - 10; wx += 27) {
        for (let wy = top + 18; wy < GROUND_Y - 12; wy += 26) {
          const lit = ((Math.floor(wx) + Math.floor(wy) + building.x) % 5) !== 0;
          if (lit) ctx.fillRect(wx, wy, 7, 10);
        }
      }
      ctx.fillStyle = '#6ad5c7';
      ctx.fillRect(building.x - 3, top - 4, building.w + 6, 5);
      ctx.fillStyle = 'rgba(11, 21, 31, .65)';
      ctx.fillRect(building.x + building.w * 0.5 - 3, top - 19, 6, 15);
    }

    for (const ledge of ledgeData) {
      ctx.fillStyle = '#354b54';
      ctx.fillRect(ledge.x, ledge.y, ledge.w, GROUND_Y - ledge.y);
      ctx.fillStyle = '#8caaa6';
      ctx.fillRect(ledge.x - 4, ledge.y - 5, ledge.w + 8, 7);
      ctx.fillStyle = '#253b46';
      for (let chip = 0; chip < 5; chip += 1) ctx.fillRect(ledge.x + 12 + chip * 33, ledge.y + 25 + (chip % 2) * 17, 13, 4);
    }

    const boatY = getBoatY();
    ctx.save();
    ctx.translate(2440, boatY);
    ctx.rotate(Math.sin(state.time * 2.4) * 0.035);
    ctx.fillStyle = '#c86d57';
    ctx.beginPath();
    ctx.moveTo(-125, 0); ctx.lineTo(118, 0); ctx.lineTo(82, 35); ctx.lineTo(-88, 35); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#f2c17a';
    ctx.fillRect(-65, -18, 126, 18);
    ctx.fillStyle = '#7d4e55';
    ctx.fillRect(-25, -48, 7, 30);
    ctx.fillStyle = '#ffcc73';
    ctx.beginPath(); ctx.moveTo(-18, -47); ctx.lineTo(30, -33); ctx.lineTo(-18, -25); ctx.closePath(); ctx.fill();
    ctx.restore();

    drawPad();
    drawSurvivors();
    drawCable();
    drawHelicopter();
    drawParticles();
    ctx.restore();
  }

  function drawPad() {
    ctx.fillStyle = '#192c37';
    ctx.fillRect(48, GROUND_Y - 5, 258, 9);
    ctx.fillStyle = '#73f2ba';
    ctx.globalAlpha = 0.22;
    ctx.beginPath(); ctx.ellipse(178, GROUND_Y - 8, 116, 28, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#73f2ba';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(178, GROUND_Y - 8, 94, 20, 0, 0, TAU); ctx.stroke();
    text('HOSPITAL PAD', 178, GROUND_Y - 34, 11, '#a8ffe0', 'center', 800);
    ctx.fillStyle = '#ef6d65';
    ctx.fillRect(117, GROUND_Y - 86, 7, 41);
    ctx.fillStyle = '#ffd166';
    ctx.beginPath(); ctx.moveTo(124, GROUND_Y - 85); ctx.lineTo(163, GROUND_Y - 72); ctx.lineTo(124, GROUND_Y - 60); ctx.closePath(); ctx.fill();
  }

  function drawSurvivors() {
    for (const survivor of state.survivors) {
      if (survivor.status === 'aboard' || survivor.status === 'delivered') continue;
      if (survivor.kind === 'boat' && survivor.status === 'waiting') survivor.y = getBoatY() - 22;
      const bob = survivor.status === 'waiting' ? Math.sin(state.time * 4 + survivor.id) * 2 : 0;
      const x = survivor.x;
      const y = survivor.y + bob;
      ctx.globalAlpha = survivor.status === 'hooked' ? 1 : 0.96;
      ctx.fillStyle = '#fff2b2';
      ctx.beginPath(); ctx.arc(x, y - 14, 7, 0, TAU); ctx.fill();
      ctx.fillStyle = survivor.color;
      ctx.beginPath(); ctx.moveTo(x - 9, y - 6); ctx.lineTo(x + 9, y - 6); ctx.lineTo(x + 6, y + 14); ctx.lineTo(x - 6, y + 14); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = survivor.color;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x - 5, y + 13); ctx.lineTo(x - 10, y + 25); ctx.moveTo(x + 5, y + 13); ctx.lineTo(x + 10, y + 25); ctx.stroke();
      ctx.globalAlpha = 1;
      if (survivor.status === 'waiting') {
        roundedFill(x - 19, y - 48, 38, 17, 8, 'rgba(14, 26, 38, .8)');
        text('SOS', x, y - 40, 9, '#ffe082', 'center', 800);
      }
    }
  }

  function drawCable() {
    const topX = state.x;
    const topY = state.y + 24;
    const hook = hookPoint();
    ctx.lineCap = 'round';
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(4, 11, 18, .65)';
    ctx.beginPath(); ctx.moveTo(topX + 2, topY); ctx.lineTo(hook.x + 2, hook.y + 2); ctx.stroke();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#d9eef0';
    ctx.beginPath();
    for (let i = 0; i <= 4; i += 1) {
      const t = i / 4;
      const sway = Math.sin(state.time * 5 + i * 1.2) * 1.4 * t;
      const px = lerp(topX, hook.x, t) + sway;
      const py = lerp(topY, hook.y, t);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.fillStyle = state.hooked !== null ? '#ffe082' : '#efffff';
    ctx.beginPath(); ctx.arc(hook.x, hook.y, 6, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#182530';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(hook.x, hook.y + 2, 5, 0, Math.PI); ctx.stroke();
  }

  function drawHelicopter() {
    ctx.save();
    ctx.translate(state.x, state.y);
    ctx.rotate(state.angle);
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = '#09141c';
    ctx.beginPath(); ctx.ellipse(0, 31, 43, 8, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#c9f5ec';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-6, -11); ctx.lineTo(-6, -28); ctx.moveTo(-47, -29); ctx.lineTo(38, -29); ctx.stroke();
    ctx.strokeStyle = 'rgba(204, 247, 240, .45)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-55, -29); ctx.lineTo(46, -29); ctx.stroke();
    ctx.fillStyle = '#59d3c3';
    ctx.beginPath(); ctx.moveTo(-36, -10); ctx.quadraticCurveTo(-28, -27, 7, -25); ctx.quadraticCurveTo(28, -23, 37, -4); ctx.lineTo(29, 13); ctx.quadraticCurveTo(0, 24, -31, 14); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#163344';
    ctx.beginPath(); ctx.moveTo(-4, -18); ctx.quadraticCurveTo(17, -18, 27, -5); ctx.lineTo(8, 5); ctx.lineTo(-7, 2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#f8d27d';
    ctx.beginPath(); ctx.arc(-16, -5, 5, 0, TAU); ctx.fill();
    ctx.fillStyle = '#e36f63';
    ctx.fillRect(-42, -4, 8, 7);
    ctx.fillStyle = '#3b7077';
    ctx.beginPath(); ctx.moveTo(-31, 10); ctx.lineTo(-56, 19); ctx.lineTo(-56, 25); ctx.lineTo(-28, 18); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#b7ebe0';
    ctx.fillRect(-30, 19, 53, 4);
    ctx.fillStyle = '#f7df93';
    ctx.beginPath(); ctx.arc(0, 0, 3, 0, TAU); ctx.fill();
    ctx.restore();
  }

  function drawParticles() {
    for (const particle of state.particles) {
      ctx.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1);
      ctx.fillStyle = particle.color;
      ctx.beginPath(); ctx.arc(particle.x, particle.y, particle.size, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawWindsock() {
    const x = 324;
    const y = 72;
    ctx.strokeStyle = '#9fbcbf';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x, y + 38); ctx.lineTo(x, y); ctx.stroke();
    const direction = state.wind >= 0 ? 1 : -1;
    const strength = clamp(Math.abs(state.wind) / 58, 0.16, 1);
    ctx.fillStyle = Math.abs(state.wind) > 30 ? '#ff9f73' : '#ffcb78';
    ctx.beginPath();
    ctx.moveTo(x, y + 2);
    ctx.lineTo(x + direction * (37 + 36 * strength), y + 8);
    ctx.lineTo(x + direction * (31 + 29 * strength), y + 20);
    ctx.lineTo(x, y + 18);
    ctx.closePath(); ctx.fill();
    text(Math.abs(state.wind) > 30 ? 'GUST' : 'WIND', x, y + 54, 10, Math.abs(state.wind) > 30 ? '#ffb48a' : '#b5ded9', 'center', 800);
  }

  function drawHUD() {
    const pad = Math.max(14, Math.min(28, vw * 0.027));
    roundedFill(pad, 14, Math.min(282, vw * 0.32), 72, 14, 'rgba(8, 16, 28, .74)');
    text('VERTOL RESCUE', pad + 15, 30, 13, '#f3f7ef', 'left', 900);
    text(`${state.delivered} / 8 HOME`, pad + 15, 52, 16, '#73f2ba', 'left', 900);
    text(`SCORE ${scoreNow()}`, pad + 155, 52, 11, '#9eb4bd', 'left', 800);
    text('FUEL', pad + 15, 75, 9, '#a9bdc0', 'left', 800);
    roundedFill(pad + 48, 70, 112, 9, 5, 'rgba(185, 225, 215, .16)');
    roundedFill(pad + 48, 70, 112 * clamp(state.fuel / 100, 0, 1), 9, 5, state.fuel < 25 ? '#ff756e' : '#73f2ba');
    text(`${Math.ceil(state.fuel)}%`, pad + 170, 75, 9, state.fuel < 25 ? '#ff9d95' : '#a9bdc0', 'left', 800);

    roundedFill(vw - 196, 14, 182, 43, 13, 'rgba(8, 16, 28, .74)');
    text('ONBOARD', vw - 180, 29, 9, '#a9bdc0', 'left', 800);
    text(`${state.onboard.length} / 8`, vw - 180, 47, 17, '#ffe082', 'left', 900);
    text(`BEST ${bestScore}`, vw - 82, 38, 10, '#9eb4bd', 'center', 800);
    drawWindsock();

    const instruction = 'STICK: FLY  •  LEVER: WINCH  •  BRING THEM HOME';
    text(instruction, vw * 0.5, vh - 24, Math.max(9, Math.min(12, vw * 0.015)), 'rgba(220, 239, 232, .72)', 'center', 800);

    drawStick();
    drawLever();
  }

  function drawStick() {
    const base = getStickBase();
    ctx.globalAlpha = 0.88;
    ctx.fillStyle = 'rgba(12, 28, 42, .78)';
    ctx.beginPath(); ctx.arc(base.x, base.y, base.radius + 12, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(149, 220, 212, .32)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(base.x, base.y, base.radius + 2, 0, TAU); ctx.stroke();
    const knobX = base.x + input.stickX * base.radius;
    const knobY = base.y - input.stickY * base.radius;
    ctx.fillStyle = '#5bd5c5';
    ctx.beginPath(); ctx.arc(knobX, knobY, 25, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, .38)';
    ctx.beginPath(); ctx.arc(knobX - 7, knobY - 8, 6, 0, TAU); ctx.fill();
    text('FLY', base.x, base.y + base.radius + 24, 10, 'rgba(208, 243, 234, .82)', 'center', 900);
    ctx.globalAlpha = 1;
  }

  function drawLever() {
    const bounds = getLeverBounds();
    const trackH = bounds.bottom - bounds.top;
    ctx.globalAlpha = 0.9;
    roundedFill(bounds.x - 23, bounds.top - 14, 46, trackH + 28, 20, 'rgba(12, 28, 42, .8)');
    ctx.strokeStyle = 'rgba(149, 220, 212, .32)';
    ctx.lineWidth = 2;
    rr(bounds.x - 23, bounds.top - 14, 46, trackH + 28, 20); ctx.stroke();
    ctx.strokeStyle = 'rgba(209, 241, 231, .32)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(bounds.x, bounds.top + 16); ctx.lineTo(bounds.x, bounds.bottom - 16); ctx.stroke();
    const handleY = bounds.top + input.lever * trackH;
    ctx.fillStyle = '#ffcb78';
    ctx.beginPath(); ctx.arc(bounds.x, handleY, 20, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, .45)';
    ctx.beginPath(); ctx.arc(bounds.x - 5, handleY - 6, 5, 0, TAU); ctx.fill();
    text('RAISE', bounds.x, bounds.top - 26, 9, '#b8ded8', 'center', 800);
    text('WINCH', bounds.x, bounds.bottom + 25, 10, '#ffe09c', 'center', 900);
    ctx.globalAlpha = 1;
  }

  function drawStateCard() {
    if (state.mode === 'playing') return;
    ctx.fillStyle = 'rgba(5, 10, 18, .58)';
    ctx.fillRect(0, 0, vw, vh);
    const cardW = Math.min(420, vw - 40);
    const cardH = Math.min(250, vh - 60);
    const x = (vw - cardW) * 0.5;
    const y = (vh - cardH) * 0.5;
    roundedFill(x, y, cardW, cardH, 22, 'rgba(13, 27, 40, .96)');
    ctx.strokeStyle = state.mode === 'won' ? '#73f2ba' : '#ff756e';
    ctx.lineWidth = 2;
    rr(x, y, cardW, cardH, 22); ctx.stroke();
    text(state.mode === 'won' ? 'FLIGHT COMPLETE' : 'AIRFRAME DOWN', vw * 0.5, y + 51, 25, state.mode === 'won' ? '#73f2ba' : '#ff8b82', 'center', 900);
    text(state.reason, vw * 0.5, y + 88, 12, '#c8d9d8', 'center', 800);
    const finalScore = state.mode === 'won' ? Math.max(0, state.delivered * 100 + Math.floor(600 - state.time * 5)) : scoreNow();
    text(`SCORE  ${finalScore}`, vw * 0.5, y + 127, 20, '#ffe082', 'center', 900);
    text(`BEST  ${bestScore}`, vw * 0.5, y + 154, 11, '#9eb4bd', 'center', 800);
    roundedFill(x + 34, y + cardH - 58, cardW - 68, 40, 15, state.mode === 'won' ? '#236d5f' : '#7d3d48');
    text('TAP OR PRESS SPACE TO RESTART', vw * 0.5, y + cardH - 38, 11, '#fff7df', 'center', 900);
  }

  function drawPortraitOverlay() {
    if (!portraitMode()) return;
    ctx.fillStyle = 'rgba(5, 11, 20, .84)';
    ctx.fillRect(0, 0, vw, vh);
    const cx = vw * 0.5;
    const cy = vh * 0.5;
    ctx.save();
    ctx.translate(cx - 28, cy - 40);
    ctx.rotate(-0.35);
    ctx.strokeStyle = '#73f2ba';
    ctx.lineWidth = 5;
    rr(-19, -34, 38, 68, 8); ctx.stroke();
    ctx.fillStyle = '#73f2ba'; ctx.beginPath(); ctx.arc(0, 25, 3, 0, TAU); ctx.fill();
    ctx.restore();
    text('ROTATE YOUR PHONE', cx + 24, cy - 16, 17, '#f6f4df', 'center', 900);
    text('LANDSCAPE FLIGHT DECK', cx + 24, cy + 14, 10, '#9eb4bd', 'center', 800);
  }

  function render() {
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.clearRect(0, 0, vw, vh);
    drawBackground();
    const shake = state.cameraShake > 0 ? state.cameraShake * 8 : 0;
    ctx.save();
    ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    drawWorld();
    ctx.restore();
    drawHUD();
    drawStateCard();
    drawPortraitOverlay();
  }

  function frame(now) {
    const dt = Math.min(0.034, Math.max(0.001, (now - lastTime) / 1000));
    lastTime = now;
    update(dt);
    render();
    requestAnimationFrame(frame);
  }

  resize();
  resetGame();
  window.addEventListener('resize', resize, { passive: true });
  canvas.addEventListener('pointerdown', pointerDown, { passive: false });
  canvas.addEventListener('pointermove', pointerMove, { passive: false });
  canvas.addEventListener('pointerup', pointerUp, { passive: false });
  canvas.addEventListener('pointercancel', pointerUp, { passive: false });
  canvas.addEventListener('touchmove', (event) => event.preventDefault(), { passive: false });
  window.addEventListener('keydown', (event) => keyChange(event, true), { passive: false });
  window.addEventListener('keyup', (event) => keyChange(event, false), { passive: false });
  requestAnimationFrame(frame);
})();
