(() => {
  "use strict";

  const canvas = document.getElementById("gameCanvas");
  const stage = document.querySelector(".game-stage");
  const srStatus = document.getElementById("screenReaderStatus");
  const ctx = canvas.getContext("2d", { alpha: false });
  const W = 390;
  const H = 700;
  const SAVE_KEY = "fieldnotes-safari:dex-v1";
  const MAX_PARTICLES = 90;
  const MAX_ACTIONS = 12;
  const MAX_ACTIVE_POINTERS = 4;

  const C = {
    ink: "#17352c",
    deep: "#10251f",
    leaf: "#2d6d54",
    mint: "#b9e7af",
    paper: "#f3f0d8",
    cream: "#fff9df",
    sun: "#ffcc65",
    coral: "#f27e69",
    lilac: "#cbb9f6",
    blue: "#8ecdd4",
    white: "#fffef1",
    muted: "#9bb4a5",
    line: "rgba(243, 240, 216, .16)",
    shadow: "rgba(4, 15, 11, .32)"
  };

  const WEATHER = [
    { key: "clear", label: "CLEAR", glyph: "☼", color: C.sun },
    { key: "rain", label: "DRIZZLE", glyph: "⋰", color: C.blue },
    { key: "wind", label: "WINDY", glyph: "≈", color: C.mint },
    { key: "overcast", label: "CLOUDED", glyph: "◌", color: C.paper },
    { key: "dusk", label: "DUSK", glyph: "☾", color: C.lilac }
  ];

  const HABITATS = {
    park: { label: "CLOVER PARK", short: "PARK", color: "#8bcf86", bg: "#244b3d" },
    canal: { label: "SILT CANAL", short: "CANAL", color: "#80cbd0", bg: "#21464b" },
    market: { label: "LANTERN MARKET", short: "MARKET", color: "#f0b267", bg: "#4f352d" },
    rooftops: { label: "SUNLINE ROOFTOPS", short: "ROOFTOPS", color: "#c8aaf1", bg: "#3a304d" }
  };

  // Every species is original and deliberately has a visible habitat/weather rule.
  const SPECIES = [
    { id: "emberpuff", name: "Emberpuff", habitat: "park", weather: "clear", odds: "1:3", weight: 6, base: 12, variance: 7, color: "#f18d68", note: "Warms its paws on sunlit stones." },
    { id: "fernwisp", name: "Fernwisp", habitat: "park", weather: "rain", odds: "1:4", weight: 5, base: 10, variance: 8, color: "#84c99a", note: "Hides its glow under wet fronds." },
    { id: "pebblepica", name: "Pebblepica", habitat: "park", weather: "wind", odds: "1:5", weight: 4, base: 8, variance: 5, color: "#d7c08a", note: "Stacks tiny stones in windbreaks." },
    { id: "lumenlug", name: "Lumenlug", habitat: "park", weather: "dusk", odds: "1:6", weight: 3, base: 16, variance: 9, color: "#d7b9ff", note: "Leaves a soft trail after sundown." },
    { id: "bramblebun", name: "Bramblebun", habitat: "park", weather: "overcast", odds: "1:4", weight: 5, base: 18, variance: 6, color: "#c7838a", note: "Naps where the clouds make shade." },
    { id: "whistlecap", name: "Whistlecap", habitat: "park", weather: "clear", odds: "1:7", weight: 2, base: 6, variance: 4, color: "#e8df83", note: "Mimics a park gate latch." },

    { id: "siltkip", name: "Siltkip", habitat: "canal", weather: "rain", odds: "1:3", weight: 6, base: 11, variance: 7, color: "#7ac7c0", note: "Skips between raindrop rings." },
    { id: "ripplefin", name: "Ripplefin", habitat: "canal", weather: "clear", odds: "1:4", weight: 5, base: 14, variance: 9, color: "#75b6e3", note: "Counts reflections under bridges." },
    { id: "reedrake", name: "Reedrake", habitat: "canal", weather: "wind", odds: "1:5", weight: 4, base: 22, variance: 8, color: "#a5c879", note: "Sails on a bent reed blade." },
    { id: "moonmidge", name: "Moonmidge", habitat: "canal", weather: "dusk", odds: "1:6", weight: 3, base: 5, variance: 3, color: "#c1b7ff", note: "Flashes once beside the lock lights." },
    { id: "bankbloom", name: "Bankbloom", habitat: "canal", weather: "overcast", odds: "1:4", weight: 5, base: 9, variance: 6, color: "#e3a5bd", note: "Opens only beneath a gray sky." },
    { id: "drizzledot", name: "Drizzledot", habitat: "canal", weather: "rain", odds: "1:7", weight: 2, base: 4, variance: 3, color: "#d3e9ef", note: "Bounces like a bead on the water." },

    { id: "clattercub", name: "Clattercub", habitat: "market", weather: "clear", odds: "1:3", weight: 6, base: 15, variance: 7, color: "#e9a25e", note: "Collects the quietest bottle caps." },
    { id: "saffronknot", name: "Saffronknot", habitat: "market", weather: "overcast", odds: "1:4", weight: 5, base: 7, variance: 5, color: "#edca6f", note: "Ties scent trails around stall legs." },
    { id: "tinwhisker", name: "Tinwhisker", habitat: "market", weather: "wind", odds: "1:5", weight: 4, base: 13, variance: 8, color: "#9fc2c5", note: "Hums in the awnings." },
    { id: "berrybaffle", name: "Berrybaffle", habitat: "market", weather: "rain", odds: "1:6", weight: 3, base: 10, variance: 6, color: "#c982a8", note: "Swaps one berry for another." },
    { id: "lamplume", name: "Lamplume", habitat: "market", weather: "dusk", odds: "1:4", weight: 5, base: 20, variance: 8, color: "#f5bd70", note: "Sleeps inside a warm paper lantern." },
    { id: "cratecricket", name: "Cratecricket", habitat: "market", weather: "clear", odds: "1:7", weight: 2, base: 5, variance: 4, color: "#a4d084", note: "Keeps time with the loading carts." },

    { id: "gloamgull", name: "Gloamgull", habitat: "rooftops", weather: "dusk", odds: "1:3", weight: 6, base: 26, variance: 9, color: "#a69bde", note: "Maps chimney shadows at twilight." },
    { id: "solaroo", name: "Solaroo", habitat: "rooftops", weather: "clear", odds: "1:4", weight: 5, base: 19, variance: 8, color: "#f4bd65", note: "Stores afternoon warmth in its ears." },
    { id: "ventsprite", name: "Ventsprite", habitat: "rooftops", weather: "wind", odds: "1:5", weight: 4, base: 12, variance: 7, color: "#8bd3c9", note: "Rides the updraft above a vent." },
    { id: "rainrattle", name: "Rainrattle", habitat: "rooftops", weather: "rain", odds: "1:6", weight: 3, base: 9, variance: 6, color: "#83bddf", note: "Shakes loose drops from roof tiles." },
    { id: "skyburr", name: "Skyburr", habitat: "rooftops", weather: "overcast", odds: "1:4", weight: 5, base: 6, variance: 5, color: "#d3c1a2", note: "Blends into a rolled-up cloud." },
    { id: "chimneychime", name: "Chimneychime", habitat: "rooftops", weather: "clear", odds: "1:7", weight: 2, base: 8, variance: 4, color: "#e6a9b6", note: "Rings when the first star appears." }
  ];

  const speciesById = new Map(SPECIES.map((species) => [species.id, species]));
  const ui = {
    map: { x: 16, y: 98, w: 358, h: 363 },
    action: { x: 26, y: 539, w: 226, h: 58 },
    notes: { x: 260, y: 539, w: 104, h: 58 },
    restart: { x: 26, y: 614, w: 338, h: 48 },
    back: { x: 18, y: 24, w: 84, h: 48 },
    captureBack: { x: 28, y: 624, w: 334, h: 49 },
    resultContinue: { x: 52, y: 484, w: 286, h: 48 },
    medalContinue: { x: 52, y: 516, w: 286, h: 48 },
    dexList: { x: 16, y: 112, w: 358, h: 474 },
    dexDetail: { x: 16, y: 596, w: 358, h: 88 }
  };

  let state = "map";
  let pausedByOrientation = false;
  let lastFrame = 0;
  let lastResize = 0;
  let conditionCache = { stamp: 0, value: null };
  let lastPhaseKey = "";
  let lastWeatherKey = "";
  let mapSeed = 0;
  let district = null;
  let currentNode = 0;
  let visited = new Set();
  let steps = 12;
  const maxSteps = 12;
  let practiceMode = false;
  let walkCount = 0;
  let score = 0;
  let best = 0;
  let records = Object.create(null);
  let encounter = null;
  let selectedDex = 0;
  let captureTime = 0;
  let capturePointer = null;
  let captureTarget = { x: 260, y: 245, vx: 0, vy: 0 };
  let captureDrag = null;
  let throwsLeft = 3;
  let result = null;
  let toastText = "";
  let toastUntil = 0;
  let flash = 0;
  let shake = 0;
  let pulse = 0;
  let particles = [];
  let actionQueue = [];
  let keyState = new Set();
  let activePointers = new Map();
  let input = {
    mapPointerId: null,
    mapStart: null,
    encounterPointerId: null,
    notesPointerId: null,
    restartPointerId: null,
    backPointerId: null,
    dexPointerId: null,
    capturePointerId: null,
    captureStart: null
  };
  let pendingTimers = new Set();
  let audioContext = null;
  let rng = mulberry32(1);

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function finite(value, fallback = 0) {
    return Number.isFinite(value) ? value : fallback;
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function random() {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hashSeed(value) {
    let hash = 2166136261;
    const textValue = String(value);
    for (let i = 0; i < textValue.length; i += 1) {
      hash ^= textValue.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function safeLoad() {
    const fallback = { records: Object.create(null), best: 0 };
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      if (typeof raw !== "string" || raw.length === 0 || raw.length > 18000) return fallback;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return fallback;
      const nextRecords = Object.create(null);
      if (parsed.records && typeof parsed.records === "object" && !Array.isArray(parsed.records)) {
        let count = 0;
        for (const species of SPECIES) {
          const entry = parsed.records[species.id];
          if (!entry || typeof entry !== "object" || count >= SPECIES.length) continue;
          const size = finite(entry.bestSize, 0);
          const seen = entry.seen === true;
          if (seen && size >= 0 && size <= 999) {
            nextRecords[species.id] = { seen: true, bestSize: Math.round(size * 10) / 10 };
            count += 1;
          }
        }
      }
      return {
        records: nextRecords,
        best: clamp(Math.floor(finite(parsed.best, 0)), 0, SPECIES.length)
      };
    } catch (error) {
      return fallback;
    }
  }

  function safeSave() {
    try {
      const safeRecords = Object.create(null);
      for (const species of SPECIES) {
        const entry = records[species.id];
        if (entry && entry.seen === true && Number.isFinite(entry.bestSize)) {
          safeRecords[species.id] = {
            seen: true,
            bestSize: clamp(Math.round(entry.bestSize * 10) / 10, 0, 999)
          };
        }
      }
      window.localStorage.setItem(SAVE_KEY, JSON.stringify({
        records: safeRecords,
        best: clamp(Math.floor(best), 0, SPECIES.length)
      }));
    } catch (error) {
      // Private browsing and blocked storage are both valid play conditions.
    }
  }

  function schedule(fn, delay) {
    let timer = null;
    timer = window.setTimeout(() => {
      pendingTimers.delete(timer);
      fn();
    }, delay);
    pendingTimers.add(timer);
    return timer;
  }

  function cancelTimers() {
    for (const timer of pendingTimers) window.clearTimeout(timer);
    pendingTimers.clear();
  }

  function clearInput() {
    for (const pointerId of activePointers.keys()) {
      try { canvas.releasePointerCapture(pointerId); } catch (error) { /* no-op */ }
    }
    activePointers.clear();
    keyState.clear();
    actionQueue.length = 0;
    input.mapPointerId = null;
    input.mapStart = null;
    input.encounterPointerId = null;
    input.notesPointerId = null;
    input.restartPointerId = null;
    input.backPointerId = null;
    input.dexPointerId = null;
    input.capturePointerId = null;
    input.captureStart = null;
    capturePointer = null;
    captureDrag = null;
  }

  function queueAction(action) {
    if (actionQueue.length >= MAX_ACTIONS) actionQueue.shift();
    actionQueue.push(action);
  }

  function showToast(message, duration = 1800) {
    toastText = message;
    toastUntil = performance.now() + duration;
  }

  function unlockAudio() {
    try {
      if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
      if (audioContext.state === "suspended") audioContext.resume();
    } catch (error) {
      audioContext = null;
    }
  }

  function chirp(frequency, duration = 0.08, type = "sine", volume = 0.035) {
    if (!audioContext) return;
    try {
      const now = audioContext.currentTime;
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, now);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(60, frequency * 1.25), now + duration);
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start(now);
      oscillator.stop(now + duration + 0.02);
    } catch (error) {
      // Audio is decorative; the game must stay playable without it.
    }
  }

  function conditions() {
    const now = Date.now();
    if (conditionCache.value && now - conditionCache.stamp < 800) return conditionCache.value;
    const date = new Date(now);
    const hour = date.getHours();
    let phase = "NIGHT";
    if (hour >= 6 && hour < 12) phase = "MORNING";
    else if (hour >= 12 && hour < 18) phase = "AFTERNOON";
    else if (hour >= 18) phase = "EVENING";
    const weatherIndex = Math.floor(now / 45000) % WEATHER.length;
    const value = {
      phase,
      dateKey: `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`,
      weather: WEATHER[weatherIndex]
    };
    conditionCache = { stamp: now, value };
    return value;
  }

  function buildDistrict(seed) {
    const random = mulberry32(seed);
    const base = [
      { x: 72, y: 160, habitat: "park", label: "Clover Gate" },
      { x: 184, y: 137, habitat: "park", label: "Fern Loop" },
      { x: 292, y: 178, habitat: "park", label: "Pondglass" },
      { x: 72, y: 276, habitat: "canal", label: "West Lock" },
      { x: 190, y: 284, habitat: "canal", label: "Silt Bend" },
      { x: 311, y: 300, habitat: "canal", label: "Reed Turn" },
      { x: 93, y: 396, habitat: "market", label: "Spice Alley" },
      { x: 220, y: 399, habitat: "market", label: "Lantern Row" },
      { x: 315, y: 414, habitat: "market", label: "Cart Court" },
      { x: 110, y: 474, habitat: "rooftops", label: "Low Roofs" },
      { x: 233, y: 474, habitat: "rooftops", label: "Signal Roof" },
      { x: 326, y: 454, habitat: "rooftops", label: "Chimney End" }
    ];
    const nodes = base.map((node, index) => ({
      ...node,
      id: index,
      x: node.x + (random() - 0.5) * 14,
      y: node.y + (random() - 0.5) * 12,
      visited: false
    }));
    const edges = [
      [0, 1], [1, 2], [0, 3], [1, 4], [2, 5], [3, 4], [4, 5],
      [3, 6], [4, 7], [5, 8], [6, 7], [7, 8], [6, 9], [7, 10],
      [8, 11], [9, 10], [10, 11]
    ];
    return { nodes, edges, seed };
  }

  function neighbors(nodeId) {
    const list = [];
    for (const edge of district.edges) {
      if (edge[0] === nodeId) list.push(edge[1]);
      else if (edge[1] === nodeId) list.push(edge[0]);
    }
    return list;
  }

  function nextStepToward(startId, goalId) {
    if (startId === goalId) return startId;
    const queue = [startId];
    const previous = Object.create(null);
    previous[startId] = -1;
    while (queue.length) {
      const current = queue.shift();
      for (const next of neighbors(current)) {
        if (previous[next] !== undefined) continue;
        previous[next] = current;
        if (next === goalId) {
          let step = next;
          while (previous[step] !== startId && previous[step] !== -1) step = previous[step];
          return step;
        }
        queue.push(next);
      }
    }
    return startId;
  }

  function distanceToSegment(px, py, ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    const length = dx * dx + dy * dy || 1;
    const t = clamp(((px - ax) * dx + (py - ay) * dy) / length, 0, 1);
    const x = ax + dx * t;
    const y = ay + dy * t;
    return { distance: Math.hypot(px - x, py - y), t };
  }

  function destinationAt(x, y) {
    const current = district.nodes[currentNode];
    let nearestNode = null;
    let nearestDistance = 9999;
    for (const node of district.nodes) {
      if (node.id === currentNode || !neighbors(currentNode).includes(node.id)) continue;
      const distance = Math.hypot(x - node.x, y - node.y);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestNode = node.id;
      }
    }
    if (nearestNode !== null && nearestDistance < 44) return nearestNode;

    let nearestPath = null;
    let nearestPathDistance = 9999;
    for (const edge of district.edges) {
      const a = district.nodes[edge[0]];
      const b = district.nodes[edge[1]];
      const hit = distanceToSegment(x, y, a.x, a.y, b.x, b.y);
      if (hit.distance < nearestPathDistance) {
        nearestPathDistance = hit.distance;
        nearestPath = edge;
      }
    }
    if (!nearestPath || nearestPathDistance > 32) return null;
    if (nearestPath.includes(currentNode)) return nearestPath[0] === currentNode ? nearestPath[1] : nearestPath[0];
    const d0 = Math.hypot(x - district.nodes[nearestPath[0]].x, y - district.nodes[nearestPath[0]].y);
    const goal = d0 < Math.hypot(x - district.nodes[nearestPath[1]].x, y - district.nodes[nearestPath[1]].y) ? nearestPath[0] : nearestPath[1];
    return nextStepToward(currentNode, goal) === currentNode ? null : nextStepToward(currentNode, goal);
  }

  function chooseSpecies(habitat, weatherKey) {
    const matching = SPECIES.filter((species) => species.habitat === habitat && species.weather === weatherKey);
    const fallback = SPECIES.filter((species) => species.habitat === habitat);
    const pool = matching.length ? matching : fallback;
    const unseen = pool.filter((species) => !records[species.id]);
    const candidates = unseen.length ? unseen : pool;
    let total = candidates.reduce((sum, species) => sum + species.weight, 0);
    let pick = rng() * total;
    for (const species of candidates) {
      pick -= species.weight;
      if (pick <= 0) return species;
    }
    return candidates[candidates.length - 1];
  }

  function rollEncounter(nodeId, guaranteed = false) {
    const node = district.nodes[nodeId];
    if (!guaranteed && rng() > 0.86) {
      encounter = null;
      showToast("Only leaves. Keep exploring.", 1300);
      return;
    }
    const weather = conditions().weather.key;
    const species = chooseSpecies(node.habitat, weather);
    encounter = { speciesId: species.id, age: 0, sparkle: rng() * Math.PI * 2 };
    pulse = 1;
    chirp(390 + rng() * 180, 0.1, "triangle", 0.025);
  }

  function moveTo(nodeId) {
    if (!district.nodes[nodeId] || nodeId === currentNode) return;
    const isPractice = practiceMode || steps <= 0;
    if (!isPractice && steps > 0) steps -= 1;
    if (steps <= 0) practiceMode = true;
    currentNode = nodeId;
    district.nodes[currentNode].visited = true;
    visited.add(currentNode);
    if (visited.size > district.nodes.length) visited.delete(visited.values().next().value);
    walkCount += 1;
    score += isPractice ? 2 : 10;
    shake = Math.max(shake, 2.5);
    burst(district.nodes[nodeId].x, district.nodes[nodeId].y, HABITATS[district.nodes[nodeId].habitat].color, 7);
    rollEncounter(nodeId);
    updateStatus(`Arrived at ${district.nodes[nodeId].label}. ${encounter ? "A field encounter is nearby." : "No creature this time."}`);
  }

  function moveByDirection(dx, dy) {
    if (state !== "map" || !district) return;
    const current = district.nodes[currentNode];
    const choices = neighbors(currentNode).map((id) => district.nodes[id]);
    let bestNode = null;
    let bestDot = -Infinity;
    for (const node of choices) {
      const vx = node.x - current.x;
      const vy = node.y - current.y;
      const length = Math.hypot(vx, vy) || 1;
      const dot = (vx / length) * dx + (vy / length) * dy;
      if (dot > bestDot) { bestDot = dot; bestNode = node.id; }
    }
    if (bestNode !== null && bestDot > 0.05) moveTo(bestNode);
  }

  function openEncounter() {
    if (!encounter || state !== "map") return;
    const species = speciesById.get(encounter.speciesId);
    if (!species) { encounter = null; return; }
    state = "capture";
    captureTime = 0;
    throwsLeft = 3;
    captureDrag = null;
    capturePointer = null;
    flash = 0.18;
    chirp(540, 0.12, "sine", 0.025);
    updateStatus(`Capture drill for ${species.name}. Flick toward the lead mark.`);
  }

  function beginCapturePointer(pointerId, x, y) {
    if (state !== "capture" || input.capturePointerId !== null) return;
    if (y < 470 || y > 626) return;
    input.capturePointerId = pointerId;
    input.captureStart = { x, y };
    capturePointer = { x, y };
    captureDrag = { x, y, startX: x, startY: y, startedAt: performance.now() };
  }

  function moveCapturePointer(pointerId, x, y) {
    if (pointerId !== input.capturePointerId || !captureDrag) return;
    capturePointer = { x: clamp(x, 12, W - 12), y: clamp(y, 110, 642) };
    captureDrag.x = capturePointer.x;
    captureDrag.y = capturePointer.y;
  }

  function releaseCapturePointer(pointerId, x, y) {
    if (pointerId !== input.capturePointerId || !captureDrag) return;
    const drag = captureDrag;
    const now = performance.now();
    const dx = x - drag.startX;
    const dy = y - drag.startY;
    const distance = Math.hypot(dx, dy);
    const elapsed = Math.max(0.07, (now - drag.startedAt) / 1000);
    const speed = distance / elapsed;
    const leadX = captureTarget.x + captureTarget.vx * 0.18;
    const leadY = captureTarget.y + captureTarget.vy * 0.18;
    const aimDistance = Math.hypot(x - leadX, y - leadY);
    const ringPhase = (captureTime * 1.25) % 1;
    const timing = Math.abs(ringPhase - 0.78) < 0.18 || ringPhase < 0.08;
    const goodDirection = dy < -52;
    const success = distance > 95 && speed > 180 && goodDirection && aimDistance < 78 && timing;
    capturePointer = null;
    captureDrag = null;
    input.capturePointerId = null;
    input.captureStart = null;
    if (success) captureSuccess();
    else captureMiss();
  }

  function captureSuccess() {
    const species = speciesById.get(encounter && encounter.speciesId);
    if (!species) { state = "map"; return; }
    const size = Math.round((species.base + rng() * species.variance) * 10) / 10;
    const previous = records[species.id];
    records[species.id] = { seen: true, bestSize: Math.max(previous ? previous.bestSize : 0, size) };
    best = Math.max(best, SPECIES.filter((item) => records[item.id]).length);
    score += 100 + Math.round(size);
    safeSave();
    result = { species, size, newRecord: !previous || size >= previous.bestSize };
    encounter = null;
    flash = 0.9;
    shake = 7;
    burst(captureTarget.x, captureTarget.y, species.color, 26);
    chirp(650, 0.12, "triangle", 0.04);
    schedule(() => chirp(900, 0.18, "sine", 0.025), 90);
    state = best >= SPECIES.length ? "medal" : "result";
    updateStatus(best >= SPECIES.length ? "Naturalist medal earned. Every creature is in the field notes." : `${species.name} recorded at ${size.toFixed(1)} cm.`);
  }

  function captureMiss() {
    throwsLeft -= 1;
    shake = 4;
    burst(captureTarget.x, captureTarget.y, C.coral, 8);
    chirp(190, 0.1, "sawtooth", 0.018);
    if (throwsLeft <= 0) {
      encounter = null;
      state = "map";
      showToast("The rustle slipped away. Another one will find you.", 1900);
      updateStatus("The encounter escaped without a failed run. Keep exploring.");
    } else {
      showToast(`${throwsLeft} field flick${throwsLeft === 1 ? "" : "s"} left. Lead the mark.`, 1200);
    }
  }

  function burst(x, y, color, count) {
    const safeCount = clamp(Math.floor(count), 0, 32);
    for (let i = 0; i < safeCount; i += 1) {
      if (particles.length >= MAX_PARTICLES) particles.shift();
      const angle = rng() * Math.PI * 2;
      const speed = 25 + rng() * 110;
      particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 18,
        life: 0.5 + rng() * 0.55,
        maxLife: 0.5 + rng() * 0.55,
        size: 2 + rng() * 4,
        color
      });
    }
  }

  function resetRun() {
    cancelTimers();
    clearInput();
    mapSeed = hashSeed(`${Date.now()}-${Math.floor(Math.random() * 100000)}`);
    district = buildDistrict(mapSeed);
    currentNode = 0;
    district.nodes[0].visited = true;
    visited = new Set([0]);
    steps = maxSteps;
    practiceMode = false;
    walkCount = 0;
    score = 0;
    encounter = null;
    result = null;
    selectedDex = 0;
    state = "map";
    flash = 0;
    shake = 0;
    pulse = 0;
    particles = [];
    rng = mulberry32(mapSeed ^ 0x9e3779b9);
    rollEncounter(0, true);
    lastFrame = performance.now();
    updateStatus("Field ready. Tap a glowing path, then follow the rustle.");
  }

  function restart() {
    resetRun();
    showToast("A fresh route is drawn. Your field notes remain.", 1600);
    chirp(300, 0.09, "triangle", 0.02);
  }

  function openDex() {
    if (state === "dex") return;
    clearInput();
    state = "dex";
    selectedDex = clamp(selectedDex, 0, SPECIES.length - 1);
    updateStatus("Field notes open. Tap a creature row to inspect its conditions.");
    chirp(420, 0.08, "sine", 0.018);
  }

  function closeOverlay() {
    if (state === "dex" || state === "result" || state === "medal") {
      state = "map";
      result = null;
      clearInput();
      updateStatus("Back in the district. The next path is yours.");
    }
  }

  function activate() {
    if (state === "map") {
      if (encounter) openEncounter();
      else practiceMode = !practiceMode;
    } else if (state === "dex" || state === "result" || state === "medal") {
      closeOverlay();
    }
  }

  function pointerPosition(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: clamp((event.clientX - rect.left) * W / Math.max(1, rect.width), 0, W),
      y: clamp((event.clientY - rect.top) * H / Math.max(1, rect.height), 0, H)
    };
  }

  function hit(rect, x, y) {
    return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
  }

  function assignPointer(pointerId, owner, point) {
    if (activePointers.size >= MAX_ACTIVE_POINTERS) return false;
    activePointers.set(pointerId, { owner, x: point.x, y: point.y });
    return true;
  }

  function pointerDown(event) {
    event.preventDefault();
    if (pausedByOrientation || document.hidden) return;
    unlockAudio();
    const point = pointerPosition(event);
    if (!assignPointer(event.pointerId, "pending", point)) return;
    try { canvas.setPointerCapture(event.pointerId); } catch (error) { /* no-op */ }

    if (state === "capture") {
      if (hit(ui.captureBack, point.x, point.y)) {
        activePointers.get(event.pointerId).owner = "back";
        input.backPointerId = event.pointerId;
        return;
      }
      if (point.y >= 470) {
        activePointers.get(event.pointerId).owner = "capture";
        beginCapturePointer(event.pointerId, point.x, point.y);
      } else activePointers.delete(event.pointerId);
      return;
    }

    if (state === "dex") {
      if (hit(ui.back, point.x, point.y)) {
        activePointers.get(event.pointerId).owner = "back";
        input.backPointerId = event.pointerId;
        return;
      }
      if (hit(ui.dexList, point.x, point.y)) {
        activePointers.get(event.pointerId).owner = "dex";
        input.dexPointerId = event.pointerId;
        return;
      }
      activePointers.delete(event.pointerId);
      return;
    }

    if (state === "result" || state === "medal") {
      const continueRect = state === "result" ? ui.resultContinue : ui.medalContinue;
      if (hit(continueRect, point.x, point.y)) {
        activePointers.get(event.pointerId).owner = "back";
        input.backPointerId = event.pointerId;
      } else activePointers.delete(event.pointerId);
      return;
    }

    if (hit(ui.notes, point.x, point.y)) {
      activePointers.get(event.pointerId).owner = "notes";
      input.notesPointerId = event.pointerId;
    } else if (hit(ui.restart, point.x, point.y)) {
      activePointers.get(event.pointerId).owner = "restart";
      input.restartPointerId = event.pointerId;
    } else if (hit(ui.action, point.x, point.y)) {
      activePointers.get(event.pointerId).owner = "encounter";
      input.encounterPointerId = event.pointerId;
    } else if (hit(ui.map, point.x, point.y)) {
      activePointers.get(event.pointerId).owner = "map";
      input.mapPointerId = event.pointerId;
      input.mapStart = point;
    } else {
      activePointers.delete(event.pointerId);
    }
  }

  function pointerMove(event) {
    event.preventDefault();
    const tracked = activePointers.get(event.pointerId);
    if (!tracked || pausedByOrientation || document.hidden) return;
    const point = pointerPosition(event);
    tracked.x = point.x;
    tracked.y = point.y;
    if (tracked.owner === "capture") moveCapturePointer(event.pointerId, point.x, point.y);
  }

  function pointerUp(event, cancelled = false) {
    event.preventDefault();
    const tracked = activePointers.get(event.pointerId);
    if (!tracked) return;
    const point = pointerPosition(event);
    activePointers.delete(event.pointerId);
    if (cancelled || pausedByOrientation || document.hidden) {
      if (tracked.owner === "capture") {
        capturePointer = null;
        captureDrag = null;
        input.capturePointerId = null;
        input.captureStart = null;
      }
      clearOwner(tracked.owner, event.pointerId);
      return;
    }
    if (tracked.owner === "map") {
      const start = input.mapStart;
      clearOwner("map", event.pointerId);
      if (start && Math.hypot(point.x - start.x, point.y - start.y) < 22) {
        const destination = destinationAt(point.x, point.y);
        if (destination !== null) moveTo(destination);
      }
    } else if (tracked.owner === "capture") {
      releaseCapturePointer(event.pointerId, point.x, point.y);
    } else if (tracked.owner === "encounter") {
      clearOwner("encounter", event.pointerId);
      if (hit(ui.action, point.x, point.y)) activate();
    } else if (tracked.owner === "notes") {
      clearOwner("notes", event.pointerId);
      if (hit(ui.notes, point.x, point.y)) openDex();
    } else if (tracked.owner === "restart") {
      clearOwner("restart", event.pointerId);
      if (hit(ui.restart, point.x, point.y)) restart();
    } else if (tracked.owner === "back") {
      clearOwner("back", event.pointerId);
      if (state === "capture" && hit(ui.captureBack, point.x, point.y)) { state = "map"; clearInput(); }
      else if (state === "dex" && hit(ui.back, point.x, point.y)) closeOverlay();
      else if (state === "result" && hit(ui.resultContinue, point.x, point.y)) closeOverlay();
      else if (state === "medal" && hit(ui.medalContinue, point.x, point.y)) closeOverlay();
    } else if (tracked.owner === "dex") {
      clearOwner("dex", event.pointerId);
      if (hit(ui.dexList, point.x, point.y)) selectDexAt(point.x, point.y);
    }
  }

  function clearOwner(owner, pointerId) {
    if (owner === "map" && input.mapPointerId === pointerId) { input.mapPointerId = null; input.mapStart = null; }
    if (owner === "encounter" && input.encounterPointerId === pointerId) input.encounterPointerId = null;
    if (owner === "notes" && input.notesPointerId === pointerId) input.notesPointerId = null;
    if (owner === "restart" && input.restartPointerId === pointerId) input.restartPointerId = null;
    if (owner === "back" && input.backPointerId === pointerId) input.backPointerId = null;
    if (owner === "dex" && input.dexPointerId === pointerId) input.dexPointerId = null;
  }

  function selectDexAt(x, y) {
    const row = Math.floor((y - 128) / 38);
    if (row < 0 || row >= 12) return;
    const column = x < 195 ? 0 : 1;
    const index = row * 2 + column;
    if (index >= 0 && index < SPECIES.length) {
      selectedDex = index;
      chirp(360 + index * 7, 0.05, "sine", 0.016);
      updateStatus(`${SPECIES[index].name}: ${SPECIES[index].note}`);
    }
  }

  function onKeyDown(event) {
    if (pausedByOrientation || document.hidden) return;
    unlockAudio();
    const key = event.key;
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " ", "Escape", "d", "D", "r", "R"].includes(key)) event.preventDefault();
    if (event.repeat && key !== "ArrowUp" && key !== "ArrowDown" && key !== "ArrowLeft" && key !== "ArrowRight") return;
    keyState.add(key);
    if (key === "ArrowUp") queueAction({ type: "move", dx: 0, dy: -1 });
    else if (key === "ArrowDown") queueAction({ type: "move", dx: 0, dy: 1 });
    else if (key === "ArrowLeft") queueAction({ type: "move", dx: -1, dy: 0 });
    else if (key === "ArrowRight") queueAction({ type: "move", dx: 1, dy: 0 });
    else if (key === " ") queueAction({ type: "activate" });
    else if (key === "Escape") queueAction({ type: "back" });
    else if (key === "d" || key === "D") queueAction({ type: "dex" });
    else if (key === "r" || key === "R") queueAction({ type: "restart" });
  }

  function onKeyUp(event) {
    keyState.delete(event.key);
  }

  function processActions() {
    const action = actionQueue.shift();
    if (!action || pausedByOrientation) return;
    if (action.type === "move") moveByDirection(action.dx, action.dy);
    else if (action.type === "activate") activate();
    else if (action.type === "dex") openDex();
    else if (action.type === "back") {
      if (state === "capture") { state = "map"; clearInput(); }
      else closeOverlay();
    } else if (action.type === "restart") restart();
  }

  function updateOrientation() {
    const nextBlocked = window.innerWidth > window.innerHeight;
    if (nextBlocked !== pausedByOrientation) {
      pausedByOrientation = nextBlocked;
      clearInput();
      lastFrame = performance.now();
      updateStatus(nextBlocked ? "Turn the field upright to resume." : "Field resumed.");
    }
    resizeCanvas();
  }

  function resizeCanvas() {
    const now = performance.now();
    if (now - lastResize < 80) return;
    lastResize = now;
    const rect = stage.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2, 960 / Math.max(rect.width, rect.height));
    const scale = Math.max(0.5, dpr);
    canvas.width = Math.max(1, Math.round(rect.width * scale));
    canvas.height = Math.max(1, Math.round(rect.height * scale));
    ctx.imageSmoothingEnabled = true;
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
  }

  function update(dt) {
    processActions();
    pulse = Math.max(0, pulse - dt * 1.6);
    flash = Math.max(0, flash - dt * 1.9);
    shake = Math.max(0, shake - dt * 14);
    if (toastText && performance.now() > toastUntil) toastText = "";
    const fieldConditions = conditions();
    const phaseKey = `${fieldConditions.dateKey}-${fieldConditions.phase}`;
    if (phaseKey !== lastPhaseKey) {
      if (fieldConditions.phase === "MORNING" || fieldConditions.phase === "EVENING") {
        steps = maxSteps;
        practiceMode = false;
        showToast(`${fieldConditions.phase.toLowerCase()} window: route refilled`, 1800);
        chirp(510, 0.1, "triangle", 0.02);
      }
      lastPhaseKey = phaseKey;
    }
    if (fieldConditions.weather.key !== lastWeatherKey) {
      if (lastWeatherKey) showToast(`Field weather: ${fieldConditions.weather.label.toLowerCase()}`, 1200);
      lastWeatherKey = fieldConditions.weather.key;
    }

    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const particle = particles[i];
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 100 * dt;
      if (particle.life <= 0) particles.splice(i, 1);
    }
    if (state === "capture") {
      captureTime += dt;
      const targetX = 258 + Math.sin(captureTime * 1.7) * 48;
      const targetY = 242 + Math.cos(captureTime * 1.15) * 22;
      captureTarget = {
        x: targetX,
        y: targetY,
        vx: Math.cos(captureTime * 1.7) * 48 * 1.7,
        vy: -Math.sin(captureTime * 1.15) * 22 * 1.15
      };
    }
    if (encounter) encounter.age += dt;
  }

  function fillRoundRect(x, y, w, h, radius, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    roundedPath(x, y, w, h, radius);
    ctx.fill();
  }

  function strokeRoundRect(x, y, w, h, radius, color, width = 1) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    roundedPath(x, y, w, h, radius);
    ctx.stroke();
  }

  function roundedPath(x, y, w, h, radius) {
    const r = Math.min(radius, w / 2, h / 2);
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(x, y, w, h, r);
      return;
    }
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function label(value, x, y, size, color = C.paper, align = "left", weight = 600) {
    ctx.fillStyle = color;
    ctx.font = `${weight} ${size}px ui-rounded, "SF Pro Rounded", "Trebuchet MS", system-ui, sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.fillText(value, x, y);
  }

  function wrap(value, x, y, maxWidth, lineHeight, size, color = C.muted, maxLines = 2, weight = 500) {
    ctx.fillStyle = color;
    ctx.font = `${weight} ${size}px ui-rounded, "SF Pro Rounded", "Trebuchet MS", system-ui, sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    const words = value.split(" ");
    let line = "";
    let lineIndex = 0;
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, x, y + lineIndex * lineHeight);
        line = word;
        lineIndex += 1;
        if (lineIndex >= maxLines - 1) break;
      } else line = test;
    }
    if (lineIndex < maxLines) ctx.fillText(line, x, y + lineIndex * lineHeight);
  }

  function drawBackground() {
    const gradient = ctx.createLinearGradient(0, 0, 0, H);
    gradient.addColorStop(0, "#16372c");
    gradient.addColorStop(0.56, "#102b25");
    gradient.addColorStop(1, "#0b1d18");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 0.18;
    for (let i = 0; i < 18; i += 1) {
      const x = (i * 79 + 22) % W;
      const y = 90 + ((i * 47) % 420);
      ctx.fillStyle = i % 2 ? C.mint : C.sun;
      ctx.beginPath();
      ctx.arc(x, y, 1.5 + (i % 3), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawHeader(title = "FIELDNOTES SAFARI") {
    fillRoundRect(16, 14, 358, 70, 18, "rgba(9, 24, 18, .74)");
    label(title, 30, 33, 17, C.cream, "left", 800);
    const field = conditions();
    label(`${field.weather.glyph} ${field.weather.label}`, 30, 61, 12, field.weather.color, "left", 700);
    const node = district.nodes[currentNode];
    label(node ? HABITATS[node.habitat].short : "FIELD", 137, 61, 12, node ? HABITATS[node.habitat].color : C.mint, "left", 700);
    label(field.phase, 222, 61, 12, C.muted, "left", 700);
    fillRoundRect(296, 27, 64, 42, 13, steps > 0 && !practiceMode ? C.mint : "#3b6250");
    label(steps > 0 && !practiceMode ? `${steps}` : "∞", 328, 43, 18, C.deep, "center", 800);
    label(steps > 0 && !practiceMode ? "STEPS" : "PRACTICE", 328, 60, 8, C.deep, "center", 800);
  }

  function drawMap() {
    drawHeader();
    fillRoundRect(ui.map.x, ui.map.y, ui.map.w, ui.map.h, 22, "rgba(10, 31, 24, .83)");
    ctx.save();
    ctx.beginPath();
    roundedPath(ui.map.x, ui.map.y, ui.map.w, ui.map.h, 22);
    ctx.clip();

    // A quiet district texture keeps the map readable without image assets.
    ctx.globalAlpha = 0.15;
    ctx.strokeStyle = C.mint;
    ctx.lineWidth = 1;
    for (let x = 34; x < 370; x += 22) {
      ctx.beginPath(); ctx.moveTo(x, 102); ctx.lineTo(x - 28, 460); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (const edge of district.edges) {
      const a = district.nodes[edge[0]];
      const b = district.nodes[edge[1]];
      ctx.strokeStyle = "rgba(189, 232, 175, .16)";
      ctx.lineWidth = 10;
      ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.strokeStyle = "rgba(217, 243, 191, .62)";
      ctx.lineWidth = 2;
      ctx.setLineDash([7, 8]);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.setLineDash([]);
    }

    const current = district.nodes[currentNode];
    for (const node of district.nodes) {
      const habitat = HABITATS[node.habitat];
      const active = node.id === currentNode;
      const wasVisited = visited.has(node.id);
      if (active) {
        ctx.globalAlpha = 0.23 + pulse * 0.1;
        ctx.fillStyle = habitat.color;
        ctx.beginPath(); ctx.arc(node.x, node.y, 30 + Math.sin(performance.now() / 320) * 2, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = wasVisited ? habitat.color : "#36564b";
      ctx.beginPath(); ctx.arc(node.x, node.y, active ? 17 : 13, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = active ? C.cream : "rgba(243, 240, 216, .38)";
      ctx.lineWidth = active ? 3 : 1.5;
      ctx.stroke();
      if (active) label("YOU", node.x, node.y - 1, 8, C.deep, "center", 900);
      else label(wasVisited ? "•" : "?", node.x, node.y, 13, C.deep, "center", 900);
      label(node.label, node.x, node.y + 26, 9, C.paper, "center", 600);
    }

    if (encounter) {
      const species = speciesById.get(encounter.speciesId);
      const bob = Math.sin(performance.now() / 250 + encounter.sparkle) * 3;
      fillRoundRect(220, 106 + bob, 140, 42, 13, "#f6e7b3");
      label("RUSTLE", 234, 120 + bob, 9, C.leaf, "left", 900);
      label(species.name, 234, 137 + bob, 13, C.ink, "left", 800);
      drawCreature(343, 127 + bob, species, 0.52);
      ctx.strokeStyle = C.sun;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(343, 127 + bob, 16, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();

    fillRoundRect(16, 474, 358, 217, 22, "rgba(9, 24, 18, .92)");
    const node = district.nodes[currentNode];
    const habitat = HABITATS[node.habitat];
    label(habitat.label, 29, 500, 12, habitat.color, "left", 800);
    label(`${score} PTS  •  ${best}/${SPECIES.length} NOTES`, 361, 500, 10, C.muted, "right", 600);
    if (encounter) {
      label("A creature is waiting on the edge of the path.", 29, 520, 12, C.cream, "left", 600);
      drawButton(ui.action, `MEET ${speciesById.get(encounter.speciesId).name.toUpperCase()}`, "TAP TO BEGIN A FLICK", C.coral, C.ink);
    } else {
      label(practiceMode ? "Practice is open — every path still teaches." : "Choose a glowing path to spend a step.", 29, 520, 12, C.cream, "left", 600);
      drawButton(ui.action, practiceMode ? "PRACTICE WALK" : "FIELD WALK", practiceMode ? "ALWAYS OPEN" : "TAP A PATH TO MOVE", practiceMode ? C.lilac : C.mint, C.deep);
    }
    drawButton(ui.notes, "FIELD", "NOTES", C.sun, C.deep);
    drawButton(ui.restart, "NEW ROUTE  ·  R", "KEEP YOUR RECORDED NOTES", "rgba(63, 102, 82, .72)", C.paper, false);
    if (best >= SPECIES.length) drawMedalRibbon(195, 665, 144);
  }

  function drawButton(rect, top, bottom, color, textColor, solid = true) {
    fillRoundRect(rect.x, rect.y, rect.w, rect.h, 15, solid ? color : color);
    if (!solid) strokeRoundRect(rect.x, rect.y, rect.w, rect.h, 15, "rgba(243, 240, 216, .22)", 1);
    label(top, rect.x + rect.w / 2, rect.y + rect.h * 0.38, rect.w < 120 ? 11 : 13, textColor, "center", 900);
    label(bottom, rect.x + rect.w / 2, rect.y + rect.h * 0.69, 9, textColor, "center", 700);
  }

  function drawCreature(x, y, species, scale = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = species.color;
    ctx.strokeStyle = "rgba(16, 37, 31, .82)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(0, 2, 22, 17, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.arc(-11, -12, 9, 0, Math.PI * 2);
    ctx.arc(11, -12, 9, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = C.deep;
    ctx.beginPath(); ctx.arc(-7, 1, 2.5, 0, Math.PI * 2); ctx.arc(7, 1, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = C.deep;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 4, 6, 0, Math.PI); ctx.stroke();
    ctx.restore();
  }

  function drawCapture() {
    const species = speciesById.get(encounter && encounter.speciesId) || SPECIES[0];
    drawHeader(`CAPTURE  /  ${species.name.toUpperCase()}`);
    fillRoundRect(16, 98, 358, 430, 22, "#1c4136");
    ctx.save();
    ctx.beginPath(); roundedPath(16, 98, 358, 430, 22); ctx.clip();
    const fieldGradient = ctx.createLinearGradient(0, 100, 0, 530);
    fieldGradient.addColorStop(0, HABITATS[species.habitat].bg);
    fieldGradient.addColorStop(1, "#112a24");
    ctx.fillStyle = fieldGradient; ctx.fillRect(16, 98, 358, 430);
    ctx.globalAlpha = 0.3;
    for (let i = 0; i < 11; i += 1) {
      ctx.strokeStyle = i % 2 ? C.mint : C.sun;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(22 + i * 38, 110); ctx.lineTo(4 + i * 42, 530); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    label("LEAD THE FLICK", 34, 126, 10, C.mint, "left", 900);
    label(`${throwsLeft} attempt${throwsLeft === 1 ? "" : "s"}`, 356, 126, 10, C.cream, "right", 700);
    const phase = (captureTime * 1.25) % 1;
    const ringRadius = 16 + phase * 48;
    ctx.strokeStyle = phase > 0.68 && phase < 0.9 ? C.sun : "rgba(243, 240, 216, .56)";
    ctx.lineWidth = phase > 0.68 && phase < 0.9 ? 4 : 2;
    ctx.beginPath(); ctx.arc(captureTarget.x, captureTarget.y, ringRadius, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = "rgba(243, 240, 216, .3)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(captureTarget.x, captureTarget.y, 42, 0, Math.PI * 2); ctx.stroke();
    const leadX = captureTarget.x + captureTarget.vx * 0.18;
    const leadY = captureTarget.y + captureTarget.vy * 0.18;
    ctx.strokeStyle = C.cream;
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 5]);
    ctx.beginPath(); ctx.arc(leadX, leadY, 12, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    label("LEAD", leadX, leadY - 21, 8, C.cream, "center", 800);
    drawCreature(captureTarget.x, captureTarget.y, species, 1.1);
    if (captureDrag) {
      ctx.strokeStyle = C.sun;
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(captureDrag.startX, captureDrag.startY); ctx.lineTo(captureDrag.x, captureDrag.y); ctx.stroke();
      ctx.fillStyle = C.sun;
      ctx.beginPath(); ctx.arc(captureDrag.x, captureDrag.y, 9, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    fillRoundRect(16, 540, 358, 151, 22, "rgba(9, 24, 18, .94)");
    label("Flick from the copper bead toward the pale lead mark.", 29, 563, 12, C.cream, "left", 700);
    wrap(`${species.name} • ${HABITATS[species.habitat].label} • ${WEATHER.find((item) => item.key === species.weather).label.toLowerCase()}`, 29, 582, 330, 15, 10, C.muted, 2, 600);
    fillRoundRect(28, 624, 334, 49, 15, "rgba(63, 102, 82, .82)");
    label("‹  BACK TO DISTRICT", 195, 649, 12, C.paper, "center", 800);
    drawFlickBead();
  }

  function drawFlickBead() {
    const x = captureDrag ? captureDrag.startX : 67;
    const y = captureDrag ? captureDrag.startY : 503;
    ctx.fillStyle = C.sun;
    ctx.strokeStyle = C.deep;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, 13, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = C.deep;
    ctx.beginPath(); ctx.arc(x - 4, y - 4, 3, 0, Math.PI * 2); ctx.fill();
  }

  function drawDex() {
    drawHeader("FIELD NOTES  /  DEX");
    fillRoundRect(ui.back.x, ui.back.y, ui.back.w, ui.back.h, 14, "rgba(63, 102, 82, .9)");
    label("‹  MAP", ui.back.x + ui.back.w / 2, ui.back.y + 23, 12, C.paper, "center", 800);
    label(`${best}/${SPECIES.length} RECORDED`, 360, 91, 10, best >= SPECIES.length ? C.sun : C.muted, "right", 800);
    fillRoundRect(ui.dexList.x, ui.dexList.y, ui.dexList.w, ui.dexList.h, 20, "rgba(9, 24, 18, .9)");
    for (let row = 0; row < 12; row += 1) {
      for (let column = 0; column < 2; column += 1) {
        const index = row * 2 + column;
        if (index >= SPECIES.length) continue;
        const species = SPECIES[index];
        const x = 23 + column * 177;
        const y = 123 + row * 38;
        const selected = selectedDex === index;
        const seen = Boolean(records[species.id]);
        fillRoundRect(x, y, 169, 32, 10, selected ? "#315e4a" : "rgba(43, 79, 63, .52)");
        ctx.fillStyle = seen ? species.color : "#49665a";
        ctx.beginPath(); ctx.arc(x + 17, y + 16, 10, 0, Math.PI * 2); ctx.fill();
        label(seen ? "•" : "?", x + 17, y + 16, 11, C.deep, "center", 900);
        label(`${String(index + 1).padStart(2, "0")}  ${species.name}`, x + 34, y + 16, 10, seen ? C.cream : C.muted, "left", 700);
        if (seen) label("✓", x + 154, y + 16, 12, C.mint, "center", 900);
      }
    }
    const species = SPECIES[selectedDex];
    const seen = records[species.id];
    fillRoundRect(ui.dexDetail.x, ui.dexDetail.y, ui.dexDetail.w, ui.dexDetail.h, 18, "#e8e7ca");
    label(`${species.name.toUpperCase()}  ·  ${seen ? `${seen.bestSize.toFixed(1)} CM BEST` : "UNSEEN"}`, 29, 614, 12, C.ink, "left", 900);
    label(`HABITAT  ${HABITATS[species.habitat].short}   WEATHER  ${WEATHER.find((item) => item.key === species.weather).label}   ODDS  ${species.odds}`, 29, 635, 9, C.leaf, "left", 800);
    wrap(species.note, 29, 650, 320, 14, 10, C.ink, 2, 600);
  }

  function drawResult() {
    drawMap();
    ctx.fillStyle = "rgba(8, 24, 18, .72)"; ctx.fillRect(0, 0, W, H);
    const species = result && result.species;
    fillRoundRect(28, 157, 334, 390, 28, C.paper);
    label("FIELD NOTE ADDED", 195, 195, 13, C.leaf, "center", 900);
    drawCreature(195, 275, species || SPECIES[0], 1.9);
    label(species ? species.name : "Unknown", 195, 344, 25, C.ink, "center", 900);
    label(result && result.newRecord ? "NEW BEST SIZE" : "RECORDED AGAIN", 195, 374, 11, C.coral, "center", 900);
    label(result ? `${result.size.toFixed(1)} cm` : "—", 195, 420, 31, C.ink, "center", 900);
    wrap(species ? species.note : "A useful observation.", 66, 455, 258, 17, 12, C.leaf, 2, 600);
    drawButton({ x: 52, y: 484, w: 286, h: 48 }, "RETURN TO DISTRICT", "SPACE OR TAP", C.leaf, C.paper);
  }

  function drawMedalRibbon(x, y, width) {
    fillRoundRect(x - width / 2, y - 16, width, 30, 12, "rgba(255, 204, 101, .92)");
    label("NATURALIST MEDAL  ✦", x, y - 1, 10, C.deep, "center", 900);
  }

  function drawMedal() {
    drawMap();
    ctx.fillStyle = "rgba(8, 24, 18, .76)"; ctx.fillRect(0, 0, W, H);
    fillRoundRect(26, 122, 338, 454, 28, "#f3f0d8");
    ctx.fillStyle = C.sun;
    ctx.beginPath(); ctx.arc(195, 250, 75, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = C.leaf; ctx.lineWidth = 5; ctx.stroke();
    label("✦", 195, 250, 56, C.deep, "center", 900);
    label("NATURALIST MEDAL", 195, 365, 20, C.ink, "center", 900);
    label("Every corner of the district has a note.", 195, 397, 12, C.leaf, "center", 700);
    label("24 / 24", 195, 444, 30, C.coral, "center", 900);
    wrap("Your field notes are complete. Keep walking to compare sizes and revisit the weather.", 58, 470, 274, 18, 12, C.ink, 3, 600);
    drawButton({ x: 52, y: 516, w: 286, h: 48 }, "KEEP EXPLORING", "SPACE OR TAP", C.leaf, C.paper);
  }

  function drawParticles() {
    for (const particle of particles) {
      ctx.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1);
      ctx.fillStyle = particle.color;
      ctx.beginPath(); ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawToast() {
    if (!toastText || performance.now() > toastUntil) return;
    const width = Math.min(336, Math.max(180, ctx.measureText(toastText).width + 38));
    fillRoundRect((W - width) / 2, 92, width, 34, 12, "#f3f0d8");
    label(toastText, W / 2, 109, 10, C.ink, "center", 800);
  }

  function drawOrientationOverlay() {
    ctx.fillStyle = "rgba(7, 20, 15, .96)"; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = C.sun; ctx.lineWidth = 4;
    ctx.beginPath(); roundedPath(138, 218, 114, 176, 20); ctx.stroke();
    ctx.fillStyle = C.sun; ctx.beginPath(); ctx.arc(195, 370, 5, 0, Math.PI * 2); ctx.fill();
    label("TURN UPRIGHT", 195, 450, 20, C.cream, "center", 900);
    label("The field is paused while you rotate.", 195, 478, 12, C.muted, "center", 600);
  }

  function render() {
    const offsetX = shake ? (rng() - 0.5) * shake : 0;
    const offsetY = shake ? (rng() - 0.5) * shake : 0;
    ctx.save();
    ctx.translate(offsetX, offsetY);
    drawBackground();
    if (state === "map") drawMap();
    else if (state === "capture") drawCapture();
    else if (state === "dex") drawDex();
    else if (state === "result") drawResult();
    else if (state === "medal") drawMedal();
    drawParticles();
    if (flash > 0) {
      ctx.globalAlpha = flash * 0.22;
      ctx.fillStyle = C.cream;
      ctx.fillRect(-10, -10, W + 20, H + 20);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    drawToast();
    if (pausedByOrientation) drawOrientationOverlay();
  }

  function updateStatus(message) {
    if (srStatus) srStatus.textContent = message;
  }

  function frame(timestamp) {
    if (!lastFrame) lastFrame = timestamp;
    const dt = Math.min(0.05, Math.max(0, (timestamp - lastFrame) / 1000));
    lastFrame = timestamp;
    if (!pausedByOrientation && !document.hidden) update(dt);
    render();
    window.requestAnimationFrame(frame);
  }

  function boot() {
    const saved = safeLoad();
    records = saved.records;
    best = SPECIES.filter((species) => records[species.id] && records[species.id].seen === true).length;
    resetRun();
    updateOrientation();
    canvas.addEventListener("pointerdown", pointerDown, { passive: false });
    canvas.addEventListener("pointermove", pointerMove, { passive: false });
    canvas.addEventListener("pointerup", pointerUp, { passive: false });
    canvas.addEventListener("pointercancel", (event) => pointerUp(event, true), { passive: false });
    window.addEventListener("keydown", onKeyDown, { passive: false });
    window.addEventListener("keyup", onKeyUp, { passive: false });
    window.addEventListener("blur", clearInput);
    document.addEventListener("visibilitychange", () => { if (document.hidden) { clearInput(); lastFrame = performance.now(); } });
    window.addEventListener("resize", updateOrientation, { passive: true });
    window.addEventListener("orientationchange", updateOrientation, { passive: true });
    window.requestAnimationFrame(frame);
  }

  boot();
})();
