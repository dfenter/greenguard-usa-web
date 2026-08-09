(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d", { alpha: false });
  const app = document.getElementById("app");
  const steerZone = document.getElementById("steer-zone");
  const steerKnob = document.getElementById("steer-knob");
  const throttleButton = document.getElementById("throttle");
  const brakeButton = document.getElementById("brake");
  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("best");
  const fuelFill = document.getElementById("fuel-fill");
  const raidReadout = document.getElementById("raid-readout");
  const compassLabel = document.getElementById("compass-label");
  const compassArrow = document.getElementById("compass-arrow");
  const hint = document.getElementById("hint");
  const statusEl = document.getElementById("status");
  const rotateEl = document.getElementById("rotate");
  const messageEl = document.getElementById("message");
  const messageKicker = document.getElementById("message-kicker");
  const messageTitle = document.getElementById("message-title");
  const messageCopy = document.getElementById("message-copy");
  const messageAction = document.getElementById("message-action");
  const messageSecondary = document.getElementById("message-secondary");
  const endRun = document.getElementById("end-run");

  const WORLD_W = 2400;
  const WORLD_H = 1600;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  function rng(seed) {
    return () => {
      seed |= 0;
      seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  const random = rng(0xD00E5EED);
  const dunes = [];
  const rocks = [];
  const oases = [
    { x: 280, y: 1320, r: 94, name: "Cinder Well" },
    { x: 2040, y: 270, r: 88, name: "Glasswater" },
    { x: 2010, y: 1300, r: 102, name: "Blue Hollow" },
    { x: 420, y: 390, r: 86, name: "Windbreak" },
    { x: 1230, y: 850, r: 96, name: "Silt Garden" }
  ];
  const raidSpots = [
    { x: 1600, y: 290, r: 124 },
    { x: 540, y: 760, r: 118 },
    { x: 1920, y: 1030, r: 128 },
    { x: 820, y: 1390, r: 122 },
    { x: 1340, y: 430, r: 130 }
  ];

  for (let i = 0; i < 46; i++) {
    const w = 160 + random() * 340;
    const h = 34 + random() * 70;
    dunes.push({
      x: 100 + random() * (WORLD_W - 200), y: 90 + random() * (WORLD_H - 180),
      w, h, angle: (random() - .5) * .7, depth: .35 + random() * .65,
      tint: random() > .5 ? 0 : 1
    });
  }
  for (let i = 0; i < 38; i++) {
    rocks.push({
      x: 70 + random() * (WORLD_W - 140), y: 70 + random() * (WORLD_H - 140),
      r: 12 + random() * 25, sides: 5 + Math.floor(random() * 3), wobble: random() * TAU,
      dark: random() > .65
    });
  }
  dunes.sort((a, b) => a.y - b.y);

  const raids = raidSpots.map((spot, raidIndex) => {
    const count = 4 + Math.floor(random() * 3);
    const flags = [];
    const start = random() * TAU;
    for (let i = 0; i < count; i++) {
      const a = start + (i / count) * TAU;
      const radius = spot.r * (.86 + random() * .19);
      flags.push({ x: spot.x + Math.cos(a) * radius, y: spot.y + Math.sin(a) * radius, tagged: false, wobble: random() * TAU });
    }
    return { ...spot, flags, index: raidIndex };
  });

  const view = { w: 1, h: 1, dpr: 1, zoom: 1, camX: 0, camY: 0 };
  const player = { x: oases[0].x, y: oases[0].y, angle: -.52, speed: 0, fuel: 100, airborne: 0, airHeight: 0, lastTerrain: 0, rockCooldown: 0 };
  const controls = { steer: 0, throttle: false, brake: false, steerPointer: null, steerStart: 0 };
  const controlPointerIds = { throttle: null, brake: null };
  const keys = Object.create(null);
  const particles = [];
  let score = 0;
  let best = 0;
  let activeRaid = 0;
  let raidTime = 60;
  let completedRaids = 0;
  let state = "playing";
  let strandedTime = 0;
  let toastTime = 0;
  let toastText = "";
  let elapsed = 0;
  let shake = 0;
  let hintTime = 5.5;
  let lastFrame = performance.now();
  let lastUi = 0;

  try { best = Number(localStorage.getItem("dune-runner-best") || 0) || 0; } catch (e) { best = 0; }
  bestEl.textContent = best;

  function resize() {
    view.w = window.innerWidth;
    view.h = window.innerHeight;
    view.dpr = Math.min(2, window.devicePixelRatio || 1);
    const longAxis = Math.max(view.w, view.h);
    const scale = Math.min(1, 960 / Math.max(1, longAxis * view.dpr));
    canvas.width = Math.max(1, Math.floor(view.w * view.dpr * scale));
    canvas.height = Math.max(1, Math.floor(view.h * view.dpr * scale));
    view.dpr *= scale;
    rotateEl.classList.toggle("hidden", view.w >= view.h);
  }
  window.addEventListener("resize", resize, { passive: true });
  resize();

  function worldToScreen(x, y) {
    return { x: (x - view.camX) * view.zoom, y: (y - view.camY) * view.zoom };
  }
  function screenToWorld(x, y) {
    return { x: x / view.zoom + view.camX, y: y / view.zoom + view.camY };
  }
  function terrainAt(x, y) {
    let value = 0;
    for (const dune of dunes) {
      const dx = x - dune.x;
      const dy = y - dune.y;
      const ca = Math.cos(dune.angle), sa = Math.sin(dune.angle);
      const rx = dx * ca + dy * sa;
      const ry = -dx * sa + dy * ca;
      const q = (rx * rx) / (dune.w * dune.w) + (ry * ry) / (dune.h * dune.h);
      if (q < 1.7) value = Math.max(value, Math.exp(-q * 2.8) * dune.depth);
    }
    return value;
  }
  function nearestOasis() {
    let found = oases[0], bestDistance = Infinity;
    for (const oasis of oases) { const d = dist(player, oasis); if (d < bestDistance) { bestDistance = d; found = oasis; } }
    return found;
  }
  function addParticle(x, y, vx, vy, life, size, color) {
    if (particles.length > 230) particles.shift();
    particles.push({ x, y, vx, vy, life, maxLife: life, size, color });
  }
  function burst(x, y, color, amount) {
    for (let i = 0; i < amount; i++) {
      const a = random() * TAU, s = 30 + random() * 140;
      addParticle(x, y, Math.cos(a) * s, Math.sin(a) * s, .35 + random() * .45, 2 + random() * 4, color);
    }
  }
  function toast(text, seconds = 2) { toastText = text; toastTime = seconds; statusEl.textContent = text; statusEl.classList.add("show"); }
  function saveBest() {
    if (score > best) { best = score; bestEl.textContent = best; try { localStorage.setItem("dune-runner-best", String(best)); } catch (e) {} }
  }
  function setRaid(index) {
    activeRaid = index % raids.length;
    raidTime = 60;
    for (const flag of raids[activeRaid].flags) flag.tagged = false;
  }
  function resetRun() {
    controls.steer = 0; controls.throttle = false; controls.brake = false; controls.steerPointer = null; controls.steerStart = 0;
    controlPointerIds.throttle = null; controlPointerIds.brake = null;
    Object.keys(keys).forEach((key) => { keys[key] = false; });
    throttleButton.classList.remove("pressed"); brakeButton.classList.remove("pressed"); updateSteerKnob();
    player.x = oases[0].x; player.y = oases[0].y; player.angle = -.52; player.speed = 0; player.fuel = 100; player.airborne = 0; player.airHeight = 0; player.lastTerrain = 0; player.rockCooldown = 0;
    score = 0; activeRaid = 0; raidTime = 60; completedRaids = 0; state = "playing"; strandedTime = 0; shake = 0; hintTime = 5.5; particles.length = 0; setRaid(0); hideMessage(); toast("RALLY STARTED", 1.4);
  }
  function showMessage(kicker, title, copy, action, secondary, actionFn, secondaryFn) {
    messageKicker.textContent = kicker; messageTitle.textContent = title; messageCopy.textContent = copy;
    messageAction.textContent = action; messageSecondary.textContent = secondary;
    messageAction.onclick = actionFn; messageSecondary.onclick = secondaryFn;
    messageEl.classList.remove("hidden");
  }
  function hideMessage() { messageEl.classList.add("hidden"); }
  function endSession() {
    state = "ended"; saveBest();
    showMessage("SESSION SCORE // " + score, "RUN COMPLETE", "The desert keeps your line. Best score: " + best + ".", "RESTART RUN", "KEEP DRIVING", resetRun, () => { state = "playing"; hideMessage(); });
  }
  endRun.addEventListener("click", () => { if (state === "playing" || state === "win") endSession(); });

  function updateSteerKnob() {
    const radius = Math.max(22, steerZone.clientWidth * .33);
    steerKnob.style.transform = `translate(calc(-50% + ${controls.steer * radius}px), -50%)`;
  }
  function setSteerFromX(clientX) {
    const rect = steerZone.getBoundingClientRect();
    const center = rect.left + rect.width * .5;
    controls.steer = clamp((clientX - center) / (rect.width * .38), -1, 1);
    updateSteerKnob();
  }
  function startSteer(pointerId, x) {
    if (controls.steerPointer !== null && controls.steerPointer !== pointerId) return;
    controls.steerPointer = pointerId; controls.steerStart = x; setSteerFromX(x);
  }
  function clearSteer(pointerId) {
    if (controls.steerPointer !== pointerId) return;
    controls.steerPointer = null; controls.steer = 0; updateSteerKnob();
  }
  app.addEventListener("pointerdown", (event) => {
    if (view.w < view.h) return;
    if (event.target.closest("button") || event.target.closest("#message") || event.target.closest("#rotate")) return;
    if (event.clientX < view.w * .56 && event.clientY > view.h * .18) { startSteer(event.pointerId, event.clientX); event.preventDefault(); }
  }, { passive: false });
  app.addEventListener("pointermove", (event) => {
    if (controls.steerPointer === event.pointerId) { setSteerFromX(event.clientX); event.preventDefault(); }
  }, { passive: false });
  app.addEventListener("pointerup", (event) => clearSteer(event.pointerId), { passive: true });
  app.addEventListener("pointercancel", (event) => clearSteer(event.pointerId), { passive: true });
  steerZone.addEventListener("pointerdown", (event) => { if (view.w < view.h) return; startSteer(event.pointerId, event.clientX); steerZone.setPointerCapture?.(event.pointerId); event.preventDefault(); }, { passive: false });

  function pressButton(button, property) {
    button.addEventListener("pointerdown", (event) => { if (view.w < view.h || controlPointerIds[property] !== null) return; controlPointerIds[property] = event.pointerId; controls[property] = true; button.classList.add("pressed"); button.setPointerCapture?.(event.pointerId); event.preventDefault(); });
    const release = (event) => { if (event && event.pointerId !== controlPointerIds[property]) return; controlPointerIds[property] = null; controls[property] = false; button.classList.remove("pressed"); if (event) event.preventDefault(); };
    button.addEventListener("pointerup", release, { passive: false }); button.addEventListener("pointercancel", release, { passive: false }); button.addEventListener("lostpointercapture", release, { passive: false });
  }
  pressButton(throttleButton, "throttle"); pressButton(brakeButton, "brake");
  window.addEventListener("keydown", (event) => { keys[event.key.toLowerCase()] = true; if (["arrowup","arrowdown","arrowleft","arrowright"," "].includes(event.key.toLowerCase())) event.preventDefault(); });
  window.addEventListener("keyup", (event) => { keys[event.key.toLowerCase()] = false; });

  function physics(dt) {
    const keyboardSteer = (keys.arrowright || keys.d ? 1 : 0) - (keys.arrowleft || keys.a ? 1 : 0);
    const steer = clamp(controls.steer + keyboardSteer, -1, 1);
    const throttle = controls.throttle || keys.arrowup || keys.w || keys[" "];
    const brake = controls.brake || keys.arrowdown || keys.s;
    const airborne = player.airborne > 0;
    const oldX = player.x, oldY = player.y;
    const oldTerrain = player.lastTerrain;
    const terrainBefore = terrainAt(player.x, player.y);
    player.lastTerrain = terrainBefore;

    if (throttle && player.fuel > 0) { player.speed += 155 * dt; player.fuel -= (4.9 + player.speed / 230) * dt; }
    else player.speed -= (airborne ? 4 : 24) * dt;
    if (brake) player.speed -= 270 * dt;
    player.speed = clamp(player.speed, 0, airborne ? 410 : 355);
    const steeringGrip = airborne ? .82 : .72 + Math.min(.3, player.speed / 900);
    player.angle += steer * (0.72 + player.speed / 180) * steeringGrip * dt;
    const moveScale = airborne ? 1.04 : 1;
    player.x += Math.cos(player.angle) * player.speed * dt * moveScale;
    player.y += Math.sin(player.angle) * player.speed * dt * moveScale;
    if (player.x < 28 || player.x > WORLD_W - 28) { player.x = clamp(player.x, 28, WORLD_W - 28); player.angle = Math.PI - player.angle; player.speed *= .68; shake = .18; }
    if (player.y < 28 || player.y > WORLD_H - 28) { player.y = clamp(player.y, 28, WORLD_H - 28); player.angle = -player.angle; player.speed *= .68; shake = .18; }

    const terrainAfter = terrainAt(player.x, player.y);
    if (!airborne && player.speed > 180 && terrainAfter > .46 && oldTerrain <= .46) {
      player.airborne = .62 + player.speed / 760; player.airHeight = 1; burst(player.x, player.y, "#e9c986", 7); toast("CREST // AIR CONTROL", 1.1);
    }
    player.lastTerrain = terrainAfter;
    if (airborne) {
      player.airborne -= dt;
      player.airHeight = clamp(player.airborne * 1.8, 0, 1);
      if (player.airborne <= 0) {
        if (player.speed > 285) { player.speed *= .54; shake = .32; burst(player.x, player.y, "#d99453", 15); toast("HARD LANDING // SPEED LOST", 1.4); }
        else { player.speed *= .88; burst(player.x, player.y, "#e9c986", 8); }
        player.airHeight = 0;
      }
    }

    player.rockCooldown -= dt;
    if (!airborne && player.rockCooldown <= 0) {
      for (const rock of rocks) {
        if (Math.hypot(player.x - rock.x, player.y - rock.y) < rock.r + 17) {
          player.rockCooldown = .38; player.speed *= .38; player.angle += (random() - .5) * 1.5; shake = .38; burst(player.x, player.y, "#b87751", 12); toast("ROCK HIT // WATCH THE RIDGES", 1.2); break;
        }
      }
    }

    for (const oasis of oases) {
      if (Math.hypot(player.x - oasis.x, player.y - oasis.y) < oasis.r * .72 && !throttle && !brake) {
        if (player.fuel < 99) { player.fuel = Math.min(100, player.fuel + 30 * dt); toast("REFUELING // " + oasis.name, .6); }
      }
    }

    if (throttle && player.speed > 50 && random() < dt * 18) addParticle(player.x - Math.cos(player.angle) * 16, player.y - Math.sin(player.angle) * 16, -Math.cos(player.angle) * (25 + random() * 45), -Math.sin(player.angle) * (25 + random() * 45), .35 + random() * .28, 3 + random() * 4, "#dec182");
    if (Math.hypot(player.x - oldX, player.y - oldY) > 0 && random() < dt * 5) addParticle(player.x - Math.cos(player.angle) * 14, player.y - Math.sin(player.angle) * 14, 0, 0, .28 + random() * .3, 2 + random() * 3, "#d2ac70");

    if (player.fuel <= 0 && player.speed < 50) {
      player.fuel = 0; state = "stranded"; strandedTime = 2.4; player.speed = 0; toast("FUEL EMPTY", 1.5);
    }
  }

  function updateRaid(dt) {
    const raid = raids[activeRaid];
    raidTime -= dt;
    if (raidTime <= 0) {
      score = Math.max(0, score - 30); saveBest(); setRaid(activeRaid); toast("RAID MISSED // -30", 2); return;
    }
    for (const flag of raid.flags) {
      if (!flag.tagged && Math.hypot(player.x - flag.x, player.y - flag.y) < 38) {
        flag.tagged = true; burst(flag.x, flag.y, "#f2c457", 14); shake = .1; toast("FLAG TAGGED // " + (raid.flags.filter(f => f.tagged).length) + "/" + raid.flags.length, .7);
      }
    }
    if (raid.flags.every(flag => flag.tagged)) {
      const bonus = 100 + Math.ceil(raidTime * 1.6);
      score += bonus; completedRaids++; saveBest(); burst(raid.x, raid.y, "#f5d36e", 32); shake = .38; toast("RAID BANKED // +" + bonus, 2.1);
      if (completedRaids >= raids.length) {
        state = "win";
        showMessage("FIVE TARGETS CLEARED", "ROUTE CLEAR", "Every checkpoint is yours. Keep driving for a higher score, or bank this run.", "KEEP DRIVING", "END RUN", () => { completedRaids = 0; state = "playing"; hideMessage(); setRaid(0); }, endSession);
      } else setRaid(activeRaid + 1);
    }
  }

  function update(dt) {
    if (view.w < view.h) return;
    elapsed += dt;
    hintTime -= dt; if (hintTime < 0) hint.classList.add("faded");
    if (toastTime > 0) { toastTime -= dt; if (toastTime <= 0) statusEl.classList.remove("show"); }
    for (let i = particles.length - 1; i >= 0; i--) { const p = particles[i]; p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .985; p.vy *= .985; if (p.life <= 0) particles.splice(i, 1); }
    shake = Math.max(0, shake - dt * 1.8);
    if (state === "playing") { physics(dt); updateRaid(dt); }
    else if (state === "stranded") {
      strandedTime -= dt; player.angle += dt * .5;
      if (strandedTime <= 0) { const oasis = nearestOasis(); player.x = oasis.x; player.y = oasis.y; player.fuel = 100; score = Math.max(0, score - 25); saveBest(); state = "playing"; toast("WALK-BACK COMPLETE // -25", 1.8); setRaid(activeRaid); }
    }
    const target = raids[activeRaid];
    const targetAngle = Math.atan2(target.y - player.y, target.x - player.x);
    const bearing = Math.round(((targetAngle + TAU) % TAU) * 180 / Math.PI);
    compassArrow.style.transform = `rotate(${bearing + 90}deg)`;
    compassLabel.textContent = "TARGET // " + String(bearing).padStart(3, "0") + "°";
    if (elapsed - lastUi > .1) {
      scoreEl.textContent = score; bestEl.textContent = best; fuelFill.style.width = player.fuel + "%"; fuelFill.style.background = player.fuel < 24 ? "#e37a51" : player.fuel < 48 ? "#e8b356" : "#e7c66c";
      const tagged = target.flags.filter(flag => flag.tagged).length;
      raidReadout.textContent = "RAID " + Math.min(completedRaids + 1, 5) + "/5 · " + tagged + "/" + target.flags.length + " FLAGS · " + Math.ceil(raidTime) + "s";
      lastUi = elapsed;
    }
  }

  function drawBackground() {
    const sky = ctx.createLinearGradient(0, 0, 0, view.h); sky.addColorStop(0, "#c8945e"); sky.addColorStop(1, "#d9b377"); ctx.fillStyle = sky; ctx.fillRect(0, 0, view.w, view.h);
    ctx.save(); ctx.globalAlpha = .11; ctx.strokeStyle = "#f4d69a"; ctx.lineWidth = 1;
    const grid = 120 * view.zoom; const ox = -((view.camX * view.zoom) % grid); const oy = -((view.camY * view.zoom) % grid);
    for (let x = ox; x < view.w + grid; x += grid) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, view.h); ctx.stroke(); }
    for (let y = oy; y < view.h + grid; y += grid) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(view.w, y); ctx.stroke(); }
    ctx.restore();
  }
  function visible(x, y, margin = 100) { const p = worldToScreen(x, y); return p.x > -margin && p.x < view.w + margin && p.y > -margin && p.y < view.h + margin; }
  function drawDune(dune) {
    if (!visible(dune.x, dune.y, dune.w)) return;
    const p = worldToScreen(dune.x, dune.y); ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(dune.angle);
    ctx.fillStyle = dune.tint ? "rgba(160,106,62,.27)" : "rgba(245,209,143,.42)"; ctx.beginPath(); ctx.ellipse(0, 5 * view.zoom, dune.w * view.zoom, dune.h * view.zoom, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = dune.tint ? "rgba(123,78,50,.34)" : "rgba(255,226,165,.44)"; ctx.lineWidth = Math.max(1, 2 * view.zoom); ctx.beginPath(); ctx.ellipse(-dune.w * .06 * view.zoom, -dune.h * .14 * view.zoom, dune.w * .82 * view.zoom, dune.h * .52 * view.zoom, 0, Math.PI * .06, Math.PI * .92); ctx.stroke();
    ctx.restore();
  }
  function drawRock(rock) {
    if (!visible(rock.x, rock.y, rock.r + 30)) return; const p = worldToScreen(rock.x, rock.y); const r = rock.r * view.zoom;
    ctx.save(); ctx.translate(p.x, p.y); ctx.fillStyle = "rgba(62,48,40,.22)"; ctx.beginPath(); ctx.ellipse(3 * view.zoom, 6 * view.zoom, r * 1.1, r * .62, 0, 0, TAU); ctx.fill(); ctx.rotate(rock.wobble); ctx.beginPath();
    for (let i = 0; i < rock.sides; i++) { const a = i / rock.sides * TAU, rr = r * (.82 + ((i * 17) % 7) / 20); const x = Math.cos(a) * rr, y = Math.sin(a) * rr * .76; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); } ctx.closePath(); ctx.fillStyle = rock.dark ? "#665647" : "#80654d"; ctx.fill(); ctx.strokeStyle = "rgba(52,45,39,.48)"; ctx.lineWidth = Math.max(1, view.zoom * 2); ctx.stroke(); ctx.restore();
  }
  function drawOasis(oasis) {
    if (!visible(oasis.x, oasis.y, oasis.r + 60)) return; const p = worldToScreen(oasis.x, oasis.y); const r = oasis.r * view.zoom;
    ctx.save(); ctx.translate(p.x, p.y); ctx.fillStyle = "rgba(78,105,67,.17)"; ctx.beginPath(); ctx.ellipse(0, 6 * view.zoom, r * 1.15, r * .72, -.15, 0, TAU); ctx.fill();
    ctx.fillStyle = "#628f80"; ctx.beginPath(); ctx.ellipse(0, 6 * view.zoom, r * .7, r * .42, -.1, 0, TAU); ctx.fill(); ctx.strokeStyle = "rgba(205,232,178,.62)"; ctx.lineWidth = Math.max(1, 2 * view.zoom); ctx.beginPath(); ctx.ellipse(0, 6 * view.zoom, r * .7, r * .42, -.1, 0, TAU); ctx.stroke();
    for (let i = -1; i <= 1; i += 2) { ctx.strokeStyle = "#4f6845"; ctx.lineWidth = Math.max(2, view.zoom * 4); ctx.beginPath(); ctx.moveTo(i * r * .55, r * .28); ctx.lineTo(i * r * .62, -r * .62); ctx.stroke(); ctx.strokeStyle = "#789d62"; ctx.lineWidth = Math.max(1, view.zoom * 2); for (let j = 0; j < 3; j++) { ctx.beginPath(); ctx.moveTo(i * r * .62, -r * .58 + j * 5 * view.zoom); ctx.lineTo(i * r * (.62 + (i * (j - 1) * .11)), -r * (.7 - j * .04)); ctx.stroke(); } }
    ctx.fillStyle = "#e9d08c"; ctx.font = `800 ${Math.max(9, 11 * view.zoom)}px Trebuchet MS`; ctx.textAlign = "center"; ctx.fillText("OASIS", 0, r * .9); ctx.restore();
  }
  function drawRaid(raid) {
    const targetVisible = visible(raid.x, raid.y, 180); const p = worldToScreen(raid.x, raid.y); const active = raids[activeRaid] === raid;
    if (targetVisible) {
      ctx.save(); ctx.translate(p.x, p.y); ctx.strokeStyle = active ? "rgba(247,210,107,.5)" : "rgba(240,219,171,.16)"; ctx.lineWidth = Math.max(1, 2 * view.zoom); ctx.setLineDash([6, 7]); ctx.beginPath(); ctx.arc(0, 0, raid.r * view.zoom, 0, TAU); ctx.stroke(); ctx.setLineDash([]); ctx.strokeStyle = active ? "rgba(247,210,107,.36)" : "rgba(240,219,171,.12)"; ctx.beginPath(); ctx.arc(0, 0, (raid.r + 18 + Math.sin(elapsed * 3) * 8) * view.zoom, 0, TAU); ctx.stroke(); if (active) { ctx.fillStyle = "#f7d26b"; ctx.beginPath(); ctx.arc(0, 0, 5 * view.zoom, 0, TAU); ctx.fill(); } ctx.restore();
    }
    if (!active) return;
    for (const flag of raid.flags) {
      if (flag.tagged || !visible(flag.x, flag.y, 40)) continue; const f = worldToScreen(flag.x, flag.y); const sway = Math.sin(elapsed * 4 + flag.wobble) * 2 * view.zoom; const h = 29 * view.zoom;
      ctx.save(); ctx.translate(f.x, f.y); ctx.strokeStyle = "#5d493a"; ctx.lineWidth = Math.max(1, 2 * view.zoom); ctx.beginPath(); ctx.moveTo(0, 9 * view.zoom); ctx.lineTo(0, -h); ctx.stroke(); ctx.fillStyle = "#ebbd58"; ctx.beginPath(); ctx.moveTo(0, -h); ctx.lineTo(17 * view.zoom + sway, -h + 7 * view.zoom); ctx.lineTo(0, -h + 14 * view.zoom); ctx.closePath(); ctx.fill(); ctx.fillStyle = "#fff0a4"; ctx.beginPath(); ctx.arc(0, 10 * view.zoom, 3 * view.zoom, 0, TAU); ctx.fill(); ctx.restore();
    }
  }
  function drawOffscreenTarget() {
    const target = raids[activeRaid]; const p = worldToScreen(target.x, target.y); if (p.x > 38 && p.x < view.w - 38 && p.y > 105 && p.y < view.h - 110) return;
    const cx = view.w * .5, cy = view.h * .51; const dx = p.x - cx, dy = p.y - cy; const t = Math.min((view.w * .44) / Math.max(1, Math.abs(dx)), (view.h * .32) / Math.max(1, Math.abs(dy))); const x = cx + dx * t, y = cy + dy * t; const a = Math.atan2(dy, dx);
    ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.fillStyle = "#f3ca62"; ctx.beginPath(); ctx.moveTo(15, 0); ctx.lineTo(-9, -9); ctx.lineTo(-5, 0); ctx.lineTo(-9, 9); ctx.closePath(); ctx.fill(); ctx.restore();
  }
  function drawParticles() {
    for (const p of particles) { if (!visible(p.x, p.y, 30)) continue; const s = worldToScreen(p.x, p.y); const alpha = clamp(p.life / p.maxLife, 0, 1) * .65; ctx.globalAlpha = alpha; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(s.x, s.y, p.size * view.zoom * (1.1 - alpha * .2), 0, TAU); ctx.fill(); } ctx.globalAlpha = 1;
  }
  function drawPlayer() {
    const p = worldToScreen(player.x, player.y); const lift = player.airHeight * 18 * view.zoom;
    ctx.save(); ctx.translate(p.x + shake * (random() - .5) * 10, p.y + shake * (random() - .5) * 10 - lift); ctx.rotate(player.angle); ctx.globalAlpha = .28; ctx.fillStyle = "#40352c"; ctx.beginPath(); ctx.ellipse(-2 * view.zoom, 11 * view.zoom + lift, 25 * view.zoom, 9 * view.zoom, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
    ctx.fillStyle = "#2b332d"; ctx.beginPath(); ctx.moveTo(21 * view.zoom, 0); ctx.lineTo(7 * view.zoom, -13 * view.zoom); ctx.lineTo(-16 * view.zoom, -11 * view.zoom); ctx.lineTo(-23 * view.zoom, 0); ctx.lineTo(-16 * view.zoom, 11 * view.zoom); ctx.lineTo(7 * view.zoom, 13 * view.zoom); ctx.closePath(); ctx.fill(); ctx.strokeStyle = "#e7bd63"; ctx.lineWidth = Math.max(1, 2 * view.zoom); ctx.stroke();
    ctx.fillStyle = "#9bc08d"; ctx.beginPath(); ctx.moveTo(9 * view.zoom, -8 * view.zoom); ctx.lineTo(1 * view.zoom, -6 * view.zoom); ctx.lineTo(1 * view.zoom, 6 * view.zoom); ctx.lineTo(9 * view.zoom, 8 * view.zoom); ctx.closePath(); ctx.fill(); ctx.fillStyle = "#e5a84f"; ctx.fillRect(-13 * view.zoom, -7 * view.zoom, 7 * view.zoom, 4 * view.zoom); ctx.fillRect(-13 * view.zoom, 3 * view.zoom, 7 * view.zoom, 4 * view.zoom); ctx.restore();
  }
  function render() {
    const follow = .08; const maxX = Math.max(0, WORLD_W - view.w / view.zoom); const maxY = Math.max(0, WORLD_H - view.h / view.zoom); view.camX = lerp(view.camX, clamp(player.x - view.w / view.zoom * .5, 0, maxX), follow); view.camY = lerp(view.camY, clamp(player.y - view.h / view.zoom * .52, 0, maxY), follow);
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0); drawBackground();
    for (const dune of dunes) drawDune(dune); for (const oasis of oases) drawOasis(oasis); for (const rock of rocks) drawRock(rock); for (const raid of raids) drawRaid(raid); drawParticles(); drawOffscreenTarget(); drawPlayer();
    if (state === "stranded") { ctx.fillStyle = "rgba(40,29,23,.18)"; ctx.fillRect(0, 0, view.w, view.h); ctx.fillStyle = "#f5e3b5"; ctx.textAlign = "center"; ctx.font = "900 24px Trebuchet MS"; ctx.fillText("STRANDED", view.w / 2, view.h * .39); ctx.font = "800 11px Trebuchet MS"; ctx.fillStyle = "#ddcda9"; ctx.fillText("WALK-BACK IN " + Math.ceil(strandedTime) + " · -25 POINTS", view.w / 2, view.h * .39 + 25); }
  }

  function frame(now) {
    const dt = Math.min(.034, Math.max(.001, (now - lastFrame) / 1000)); lastFrame = now; update(dt); render(); requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
