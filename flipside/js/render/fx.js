import { COLS, ROWS, COLORS } from '../config.js';

const MAX_PARTICLES = 300;
const MAX_STRIPS = 32;
const MAX_ARCS = 8;
const MAX_BANNERS = 3;

const TAU = Math.PI * 2;
const TYPES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function easeOutCubic(t) {
  const n = 1 - t;
  return 1 - n * n * n;
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function randomItem(items) {
  return items[(Math.random() * items.length) | 0];
}

function paletteFor(world) {
  return COLORS[world] || COLORS.sun;
}

function particleColors(world, type) {
  const palette = paletteFor(world);
  if (type === 'SEAM') return [COLORS.seam, '#fff0a8', palette.ink];
  if (type === 'G') return [palette.garbage, palette.garbageEdge, palette.ink];
  const colors = TYPES.map((name) => palette.minos[name]).filter(Boolean);
  return colors.length ? colors : [palette.ink];
}

function getWindowForCanvas(canvas) {
  if (canvas && canvas.ownerDocument && canvas.ownerDocument.defaultView) {
    return canvas.ownerDocument.defaultView;
  }
  if (typeof window !== 'undefined') return window;
  return null;
}

function readReducedMotion(canvas) {
  const view = getWindowForCanvas(canvas);
  if (!view || typeof view.matchMedia !== 'function') return { value: false, media: null };
  try {
    const media = view.matchMedia('(prefers-reduced-motion: reduce)');
    return { value: !!media.matches, media };
  } catch (_) {
    return { value: false, media: null };
  }
}

function canvasSize(canvas) {
  const width = Number(canvas && canvas.width) || Number(canvas && canvas.clientWidth) || 390;
  const height = Number(canvas && canvas.height) || Number(canvas && canvas.clientHeight) || 844;
  return { width: Math.max(1, width), height: Math.max(1, height) };
}

/*
 * Renderer and FX intentionally share this small, responsive board model.
 * Keeping it local avoids coupling the visual layer to renderer internals;
 * events still work when a lane sends pixel-space x/y values instead.
 */
function boardMetrics(canvas) {
  const { width, height } = canvasSize(canvas);
  const rawDpr = Number(globalThis.devicePixelRatio) || 1;
  const unit = Math.max(1, Math.min(2, rawDpr));
  const framePad = Math.max(unit * 4, Math.min(width, height) * 0.015);
  const verticalMargin = Math.max(unit * 6, height * 0.028);
  const cell = Math.max(1, Math.min(
    Math.max(1, (width - framePad * 2) / COLS),
    Math.max(1, (height - verticalMargin * 2) / ROWS),
  ));
  const boardWidth = cell * COLS;
  const boardHeight = cell * ROWS;
  return {
    width,
    height,
    cell,
    boardWidth,
    boardHeight,
    left: (width - boardWidth) * 0.5,
    top: (height - boardHeight) * 0.5,
  };
}

function isCoordinate(value) {
  return Array.isArray(value) && value.length >= 2 &&
    Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1]));
}

function coordinateOf(value) {
  if (isCoordinate(value)) return [Number(value[0]), Number(value[1])];
  if (!value || typeof value !== 'object') return null;
  if (Number.isFinite(Number(value.x)) && Number.isFinite(Number(value.y))) {
    return [Number(value.x), Number(value.y)];
  }
  return null;
}

function eventCells(evt) {
  if (!evt) return [];
  const source = Array.isArray(evt.cells) ? evt.cells :
    (evt.cell ? [evt.cell] : (evt.position ? [evt.position] : []));
  const cells = [];
  for (const value of source) {
    const point = coordinateOf(value);
    if (point) cells.push(point);
  }
  return cells;
}

function eventRows(evt) {
  if (!evt) return [];
  const source = Array.isArray(evt.rows) ? evt.rows :
    (Number.isFinite(Number(evt.row)) ? [evt.row] : []);
  return source
    .map((row) => Number(row))
    .filter((row) => Number.isFinite(row) && row >= 0 && row < ROWS)
    .map((row) => Math.round(row));
}

function averageCellPoint(cells, metrics) {
  const visible = cells.filter(([x, y]) => x >= 0 && x < COLS && y >= 0 && y < ROWS);
  if (!visible.length) return null;
  let x = 0;
  let y = 0;
  for (const cell of visible) {
    x += cell[0];
    y += cell[1];
  }
  x /= visible.length;
  y /= visible.length;
  return [metrics.left + (x + 0.5) * metrics.cell, metrics.top + (y + 0.5) * metrics.cell];
}

function eventPoint(evt, metrics, fallback = [COLS * 0.5, ROWS * 0.5]) {
  const cells = eventCells(evt);
  const cellPoint = averageCellPoint(cells, metrics);
  if (cellPoint) return cellPoint;

  const raw = coordinateOf(evt && (evt.position || evt.origin || evt));
  if (raw) {
    // Game events conventionally use board coordinates. Allow pixel-space
    // coordinates too, which is useful for callers that already have layout.
    if (raw[0] >= -1 && raw[0] <= COLS + 1 && raw[1] >= -1 && raw[1] <= ROWS + 1) {
      return [metrics.left + (raw[0] + 0.5) * metrics.cell,
        metrics.top + (raw[1] + 0.5) * metrics.cell];
    }
    return [raw[0], raw[1]];
  }

  return [metrics.left + fallback[0] * metrics.cell,
    metrics.top + fallback[1] * metrics.cell];
}

function rowY(row, metrics) {
  return metrics.top + (row + 0.5) * metrics.cell;
}

function addBounded(list, item, max) {
  if (list.length >= max) list.splice(0, list.length - max + 1);
  list.push(item);
}

function makeParticle(x, y, metrics, options = {}) {
  const size = options.size || randomBetween(metrics.cell * 0.10, metrics.cell * 0.23);
  const life = options.life || randomBetween(520, 1000);
  const angle = options.angle == null ? randomBetween(0, TAU) : options.angle;
  const speed = options.speed == null ? randomBetween(0.9, 3.4) : options.speed;
  const direction = options.direction == null ? randomBetween(-1, 1) : options.direction;
  return {
    kind: options.kind || 'confetti',
    x,
    y,
    vx: options.vx == null ? Math.cos(angle) * speed * metrics.cell / 1000 : options.vx,
    vy: options.vy == null ? direction * speed * metrics.cell / 1000 : options.vy,
    gravity: options.gravity == null ? randomBetween(0.000002, 0.0000045) * metrics.cell : options.gravity,
    drag: options.drag == null ? 0.998 : options.drag,
    size,
    width: options.width || randomBetween(size * 0.75, size * 1.8),
    height: options.height || randomBetween(size * 0.35, size * 0.75),
    rotation: options.rotation == null ? angle : options.rotation,
    spin: options.spin == null ? randomBetween(-0.009, 0.009) : options.spin,
    life,
    maxLife: life,
    color: options.color || '#fff',
    secondary: options.secondary || null,
    alpha: options.alpha == null ? 1 : options.alpha,
    seed: Math.random() * TAU,
  };
}

function tornPath(ctx, x, y, width, height, seed, teeth = 9) {
  const top = y - height * 0.5;
  const bottom = y + height * 0.5;
  const step = width / teeth;
  ctx.beginPath();
  ctx.moveTo(x, top);
  for (let i = 0; i <= teeth; i += 1) {
    const tooth = ((i * 13 + Math.floor(seed * 10)) % 3) * height * 0.06;
    ctx.lineTo(x + i * step, top + tooth);
  }
  ctx.lineTo(x + width, bottom);
  for (let i = teeth; i >= 0; i -= 1) {
    const tooth = ((i * 7 + Math.floor(seed * 16)) % 3) * height * 0.06;
    ctx.lineTo(x + i * step, bottom - tooth);
  }
  ctx.closePath();
}

function drawTearStrip(ctx, strip, metrics) {
  const progress = 1 - strip.life / strip.maxLife;
  const inT = easeOutCubic(clamp(progress * 2.6, 0, 1));
  const outT = clamp((progress - 0.68) / 0.32, 0, 1);
  const alpha = (1 - outT) * 0.92;
  const width = lerp(metrics.cell * 1.6, strip.width, inT);
  const height = lerp(metrics.cell * 0.08, strip.height, inT);
  const x = metrics.left + (metrics.boardWidth - width) * 0.5 + Math.sin(strip.seed) * metrics.cell * 0.04;
  const y = strip.y + Math.sin(progress * Math.PI) * metrics.cell * 0.05;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x + width * 0.5, y);
  ctx.rotate(strip.rotation * (1 - progress) * 0.25);
  ctx.translate(-(x + width * 0.5), -y);
  tornPath(ctx, x, y, width, height, strip.seed, 12);
  ctx.fillStyle = strip.color;
  ctx.fill();
  ctx.globalAlpha = alpha * 0.55;
  ctx.strokeStyle = strip.edge;
  ctx.lineWidth = Math.max(1, metrics.cell * 0.035);
  ctx.setLineDash([metrics.cell * 0.12, metrics.cell * 0.09]);
  ctx.stroke();
  ctx.restore();
}

function drawParticle(ctx, particle) {
  const age = 1 - particle.life / particle.maxLife;
  const fade = Math.min(1, particle.life / Math.min(180, particle.maxLife));
  const alpha = clamp(particle.alpha * fade, 0, 1);
  if (alpha <= 0) return;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(particle.x, particle.y);
  ctx.rotate(particle.rotation);

  if (particle.kind === 'puff') {
    const radius = particle.size * (0.45 + easeOutCubic(age) * 0.85);
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = alpha * 0.55;
    ctx.strokeStyle = particle.secondary || particle.color;
    ctx.lineWidth = Math.max(1, radius * 0.18);
    ctx.stroke();
  } else if (particle.kind === 'spark') {
    const length = particle.width * (0.8 + (1 - age) * 1.6);
    ctx.strokeStyle = particle.color;
    ctx.lineWidth = Math.max(1, particle.height * 0.28);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-length * 0.5, 0);
    ctx.lineTo(length * 0.5, 0);
    ctx.stroke();
    if (particle.secondary) {
      ctx.globalAlpha = alpha * 0.35;
      ctx.strokeStyle = particle.secondary;
      ctx.lineWidth = Math.max(1, particle.height * 0.15);
      ctx.beginPath();
      ctx.moveTo(-length * 0.85, 0);
      ctx.lineTo(-length * 0.35, 0);
      ctx.stroke();
    }
  } else {
    const flip = 0.72 + Math.sin(particle.seed + age * 12) * 0.24;
    ctx.scale(1, flip);
    ctx.fillStyle = particle.color;
    ctx.fillRect(-particle.width * 0.5, -particle.height * 0.5, particle.width, particle.height);
    ctx.globalAlpha = alpha * 0.42;
    ctx.strokeStyle = particle.secondary || '#fff';
    ctx.lineWidth = Math.max(1, particle.height * 0.09);
    ctx.strokeRect(-particle.width * 0.5, -particle.height * 0.5,
      particle.width, particle.height);
  }
  ctx.restore();
}

function drawEchoArc(ctx, arc, metrics) {
  const progress = 1 - arc.life / arc.maxLife;
  const fade = Math.sin(clamp(progress, 0, 1) * Math.PI);
  const startX = metrics.left + metrics.boardWidth * 0.08;
  const endX = metrics.left + metrics.boardWidth * 0.92;
  const y = metrics.top + metrics.boardHeight * 0.62;
  const lift = metrics.boardHeight * (0.10 + easeOutCubic(progress) * 0.08);
  const direction = arc.direction || 1;

  ctx.save();
  ctx.globalAlpha = 0.78 * fade;
  ctx.strokeStyle = arc.color;
  ctx.lineWidth = Math.max(1, metrics.cell * 0.08);
  ctx.lineCap = 'round';
  ctx.setLineDash([metrics.cell * 0.26, metrics.cell * 0.18]);
  ctx.beginPath();
  ctx.moveTo(startX, y);
  ctx.quadraticCurveTo(metrics.left + metrics.boardWidth * 0.5,
    y - lift * direction, endX, y);
  ctx.stroke();
  ctx.globalAlpha = 0.42 * fade;
  ctx.lineWidth = Math.max(1, metrics.cell * 0.035);
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(metrics.left + metrics.boardWidth * 0.5, y - lift * direction,
    metrics.cell * 0.20, Math.PI, TAU);
  ctx.stroke();
  ctx.restore();
}

function drawBanner(ctx, banner, metrics) {
  const progress = 1 - banner.life / banner.maxLife;
  const fadeIn = clamp(progress * 5, 0, 1);
  const fadeOut = clamp((progress - 0.68) / 0.32, 0, 1);
  const alpha = easeOutCubic(fadeIn) * (1 - fadeOut);
  const scale = easeOutCubic(clamp(progress * 3.5, 0, 1));
  const width = Math.min(metrics.width * 0.82, Math.max(metrics.width * 0.48, metrics.width * 0.006 * banner.text.length + metrics.width * 0.27));
  const height = Math.max(38, metrics.height * 0.072);
  const targetY = metrics.top + metrics.boardHeight * 0.17;
  const y = targetY - (1 - scale) * metrics.height * 0.025;
  const fontSize = Math.max(13, Math.min(27, height * 0.37));
  const subSize = Math.max(9, fontSize * 0.43);

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(metrics.width * 0.5, y);
  ctx.scale(banner.reduced ? 1 : 0.96 + scale * 0.04, banner.reduced ? 1 : 0.96 + scale * 0.04);
  ctx.translate(-metrics.width * 0.5, -y);

  tornPath(ctx, (metrics.width - width) * 0.5 + metrics.cell * 0.12, y + metrics.cell * 0.12,
    width, height, banner.seed + 2, 14);
  ctx.fillStyle = 'rgba(40, 30, 20, 0.18)';
  ctx.fill();
  tornPath(ctx, (metrics.width - width) * 0.5, y, width, height, banner.seed, 14);
  ctx.fillStyle = banner.color;
  ctx.fill();
  ctx.strokeStyle = banner.edge;
  ctx.lineWidth = Math.max(1, metrics.cell * 0.035);
  ctx.globalAlpha = alpha * 0.8;
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = banner.textColor;
  ctx.font = `800 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  ctx.globalAlpha = alpha;
  ctx.fillText(banner.text, metrics.width * 0.5, y - (banner.subtext ? fontSize * 0.18 : 0));
  if (banner.subtext) {
    ctx.font = `700 ${subSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    ctx.globalAlpha = alpha * 0.82;
    ctx.fillText(banner.subtext, metrics.width * 0.5, y + fontSize * 0.38);
  }
  ctx.restore();
}

function drawFlash(ctx, flash, metrics) {
  const progress = 1 - flash.life / flash.maxLife;
  const alpha = Math.sin(clamp(progress, 0, 1) * Math.PI) * flash.strength;
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = flash.color;
  ctx.fillRect(0, 0, metrics.width, metrics.height);
  ctx.restore();
}

function drawFinale(ctx, finale, metrics) {
  const progress = 1 - finale.life / finale.maxLife;
  const fade = Math.sin(clamp(progress, 0, 1) * Math.PI);
  const cx = metrics.left + metrics.boardWidth * 0.5;
  const cy = metrics.top + metrics.boardHeight * 0.5;
  const radius = metrics.cell * (1.2 + easeOutCubic(progress) * 5.4);

  ctx.save();
  ctx.globalAlpha = 0.72 * fade;
  ctx.strokeStyle = COLORS.seam;
  ctx.lineWidth = Math.max(1, metrics.cell * 0.10);
  ctx.setLineDash([metrics.cell * 0.23, metrics.cell * 0.15]);
  ctx.lineDashOffset = -progress * metrics.cell * 2;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, TAU);
  ctx.stroke();
  ctx.globalAlpha = 0.58 * fade;
  ctx.lineWidth = Math.max(1, metrics.cell * 0.045);
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(cx, metrics.top + metrics.cell * 0.25);
  ctx.lineTo(cx, metrics.top + metrics.boardHeight - metrics.cell * 0.25);
  ctx.stroke();
  ctx.restore();
}

function makeBanner(kind, evt, world, metrics, reduced) {
  const palette = paletteFor(world);
  if (kind === 'seamwin') {
    return {
      text: 'YOU MENDED THE FOLD',
      subtext: 'Keep folding',
      color: COLORS.seam,
      edge: '#a67f2e',
      textColor: '#3b2f1a',
      life: reduced ? 1800 : 2600,
      maxLife: reduced ? 1800 : 2600,
      seed: Math.random() * TAU,
      reduced,
    };
  }
  if (kind === 'gameover') {
    return {
      text: 'PAPER TORN',
      subtext: evt && evt.world ? `${evt.world === 'sun' ? 'SUNSIDE' : 'INKSIDE'} gave way` : 'Try another fold',
      color: palette.panel,
      edge: palette.garbageEdge,
      textColor: palette.ink,
      life: 1700,
      maxLife: 1700,
      seed: Math.random() * TAU,
      reduced,
    };
  }
  const phase = Number(evt && evt.phase) || 1;
  const seam = phase >= 9;
  return {
    text: seam ? 'THE SEAM' : `PHASE ${phase}`,
    subtext: seam ? 'Mend both sides' : 'The fold tightens',
    color: seam ? COLORS.seam : palette.panel,
    edge: seam ? '#a67f2e' : palette.garbageEdge,
    textColor: seam ? '#3b2f1a' : palette.ink,
    life: reduced ? 850 : 1250,
    maxLife: reduced ? 850 : 1250,
    seed: Math.random() * TAU,
    reduced,
  };
}

export function createFx(canvas) {
  const particles = [];
  const strips = [];
  const arcs = [];
  const banners = [];
  let flash = null;
  let finale = null;
  let shakeTime = 0;
  let shakeDuration = 0;
  let shakeAmplitude = 0;
  let shakePhase = 0;
  let reducedMotionState = readReducedMotion(canvas);
  const media = reducedMotionState.media;

  if (media && typeof media.addEventListener === 'function') {
    media.addEventListener('change', (event) => {
      reducedMotionState.value = !!event.matches;
    });
  } else if (media && typeof media.addListener === 'function') {
    media.addListener((event) => {
      reducedMotionState.value = !!event.matches;
    });
  }

  function reducedMotion() {
    return reducedMotionState.value;
  }

  function triggerShake(amplitude, duration) {
    if (reducedMotion()) return;
    const nextAmplitude = Math.max(0, amplitude);
    if (nextAmplitude >= shakeAmplitude * 0.85 || shakeTime <= 0) {
      shakeAmplitude = Math.max(shakeAmplitude, nextAmplitude);
      shakeDuration = Math.max(shakeDuration, duration);
      shakeTime = Math.max(shakeTime, duration);
    }
    shakePhase += 0.73;
  }

  function addParticles(count, x, y, metrics, options = {}) {
    const available = MAX_PARTICLES - particles.length;
    const amount = Math.max(0, Math.min(available, Math.round(count)));
    if (!amount) return;
    const colors = options.colors || particleColors(options.world, options.type);
    for (let i = 0; i < amount; i += 1) {
      const spreadX = options.spreadX == null ? metrics.cell * 0.5 : options.spreadX;
      const spreadY = options.spreadY == null ? metrics.cell * 0.5 : options.spreadY;
      const particle = makeParticle(
        x + randomBetween(-spreadX, spreadX),
        y + randomBetween(-spreadY, spreadY),
        metrics,
        {
          kind: options.kind || 'confetti',
          color: options.color || randomItem(colors),
          secondary: options.secondary || randomItem(colors),
          life: options.life,
          size: options.size,
          width: options.width,
          height: options.height,
          vx: options.vx,
          vy: options.vy,
          gravity: options.gravity,
          drag: options.drag,
          speed: options.speed,
          direction: options.direction,
          alpha: options.alpha,
        },
      );
      particles.push(particle);
    }
  }

  function addPuffs(cells, evt, G, metrics, countPerCell = 2) {
    const world = (evt && evt.world) || (G && G.world) || 'sun';
    const points = cells.length ? cells : [[COLS * 0.5, ROWS * 0.68]];
    const limit = Math.min(points.length, 6);
    for (let i = 0; i < limit; i += 1) {
      const point = averageCellPoint([points[i]], metrics) || eventPoint(evt, metrics);
      addParticles(reducedMotion() ? Math.max(1, countPerCell - 1) : countPerCell,
        point[0], point[1], metrics, {
          kind: 'puff',
          world,
          type: 'G',
          colors: [paletteFor(world).paper, paletteFor(world).ink],
          spreadX: metrics.cell * 0.19,
          spreadY: metrics.cell * 0.13,
          size: randomBetween(metrics.cell * 0.10, metrics.cell * 0.18),
          speed: randomBetween(0.55, 1.45),
          direction: -1,
          gravity: -0.0000004 * metrics.cell,
          life: reducedMotion() ? 260 : randomBetween(300, 520),
          alpha: 0.54,
        });
    }
  }

  function addTearStrips(evt, G, metrics) {
    const world = (evt && evt.world) || (G && G.world) || 'sun';
    const palette = paletteFor(world);
    const rows = eventRows(evt);
    const lineRows = rows.length ? rows : [Math.round(ROWS * 0.65)];
    for (const row of lineRows) {
      const strip = {
        y: rowY(row, metrics),
        width: metrics.boardWidth,
        height: metrics.cell * randomBetween(0.42, 0.72),
        rotation: randomBetween(-0.025, 0.025),
        seed: Math.random() * TAU,
        life: reducedMotion() ? 250 : randomBetween(420, 620),
        maxLife: 0,
        color: palette.paper,
        edge: palette.ink,
      };
      strip.maxLife = strip.life;
      addBounded(strips, strip, MAX_STRIPS);
    }
  }

  function addFoldStartRuffle(evt, G, metrics) {
    const world = evt && (evt.from === 'sun' || evt.from === 'ink')
      ? evt.from : ((G && G.world) || 'sun');
    const seamX = metrics.left + metrics.cell * 0.72;
    const centerY = metrics.top + metrics.boardHeight * 0.5;
    addParticles(reducedMotion() ? 8 : 20, seamX, centerY, metrics, {
      kind: 'spark',
      world,
      colors: [COLORS.seam, ...particleColors(world, 'SEAM')],
      spreadX: metrics.cell * 0.22,
      spreadY: metrics.boardHeight * 0.45,
      size: metrics.cell * 0.08,
      width: metrics.cell * 0.35,
      height: metrics.cell * 0.06,
      speed: randomBetween(0.65, 1.7),
      direction: randomBetween(-1, 1),
      life: reducedMotion() ? 260 : randomBetween(380, 720),
      gravity: 0,
      alpha: 0.85,
    });
  }

  function addFoldDoneBurst(evt, G, metrics) {
    const world = (evt && (evt.world === 'sun' || evt.world === 'ink'))
      ? evt.world : ((G && G.world) || 'sun');
    const cx = metrics.left + metrics.boardWidth * 0.5;
    const cy = metrics.top + metrics.boardHeight * 0.5;
    addParticles(reducedMotion() ? 12 : 34, cx, cy, metrics, {
      kind: 'confetti',
      world,
      colors: [paletteFor(world).paper, ...particleColors(world), COLORS.seam],
      spreadX: metrics.boardWidth * 0.42,
      spreadY: metrics.boardHeight * 0.34,
      speed: randomBetween(1.2, 2.8),
      direction: -1,
      life: reducedMotion() ? 360 : randomBetween(620, 980),
      alpha: 0.88,
    });
  }

  function addEcho(evt, G, metrics) {
    const world = (evt && evt.world) || (G && G.world) || 'sun';
    addBounded(arcs, {
      life: reducedMotion() ? 360 : 620,
      maxLife: reducedMotion() ? 360 : 620,
      direction: world === 'ink' ? -1 : 1,
      color: COLORS.seam,
    }, MAX_ARCS);
    const point = eventPoint(evt, metrics);
    addParticles(reducedMotion() ? 5 : 12, point[0], point[1], metrics, {
      kind: 'spark',
      world,
      colors: [COLORS.seam, ...particleColors(world, 'G')],
      spreadX: metrics.boardWidth * 0.28,
      spreadY: metrics.cell * 0.3,
      width: metrics.cell * 0.28,
      height: metrics.cell * 0.06,
      speed: randomBetween(0.7, 1.5),
      direction: -1,
      life: reducedMotion() ? 250 : 450,
      gravity: 0,
      alpha: 0.72,
    });
  }

  function addChargeSparks(evt, G, metrics) {
    const world = (evt && evt.world) || (G && G.world) || 'sun';
    const point = eventPoint(evt, metrics, [COLS * 0.5, ROWS * 0.82]);
    addParticles(reducedMotion() ? 4 : 8, point[0], point[1], metrics, {
      kind: 'spark',
      world,
      colors: [COLORS.seam, paletteFor(world).ink],
      spreadX: metrics.cell * 0.48,
      spreadY: metrics.cell * 0.20,
      width: metrics.cell * 0.26,
      height: metrics.cell * 0.07,
      speed: randomBetween(0.7, 1.4),
      direction: -1,
      life: reducedMotion() ? 250 : 420,
      gravity: 0,
      alpha: 0.78,
    });
  }

  function setBanner(kind, evt, G, metrics) {
    const world = (evt && evt.world) || (G && G.world) || 'sun';
    addBounded(banners, makeBanner(kind, evt, world, metrics, reducedMotion()), MAX_BANNERS);
  }

  function handle(evt, G) {
    if (!evt || typeof evt.k !== 'string') return;
    const metrics = boardMetrics(canvas);
    const world = (evt.world === 'sun' || evt.world === 'ink') ? evt.world : ((G && G.world) || 'sun');
    const cells = eventCells(evt);
    const point = eventPoint(evt, metrics);
    const palette = paletteFor(world);
    const count = Number(evt.count) || (eventRows(evt).length || 1);

    switch (evt.k) {
      case 'lock':
        addPuffs(cells, evt, G, metrics, 2);
        break;
      case 'hard':
        triggerShake(Math.min(metrics.cell * 0.17, 7), reducedMotion() ? 0 : 130);
        addParticles(reducedMotion() ? 2 : 5, point[0], point[1], metrics, {
          kind: 'spark',
          world,
          colors: [palette.ink, palette.garbageEdge],
          spreadX: metrics.cell * 0.45,
          spreadY: metrics.cell * 0.12,
          width: metrics.cell * 0.32,
          height: metrics.cell * 0.045,
          speed: randomBetween(0.8, 1.6),
          direction: -1,
          life: reducedMotion() ? 180 : 300,
          gravity: 0,
          alpha: 0.62,
        });
        break;
      case 'clear':
        addTearStrips(evt, G, metrics);
        addParticles(reducedMotion() ? Math.min(5, count * 2) : Math.min(16, count * 4),
          point[0], point[1], metrics, {
            world,
            colors: [palette.paper, palette.ink, ...particleColors(world, evt.t)],
            spreadX: metrics.boardWidth * 0.38,
            spreadY: metrics.cell * 0.22,
            speed: randomBetween(0.8, 1.8),
            direction: -1,
            life: reducedMotion() ? 260 : randomBetween(420, 650),
            alpha: 0.82,
          });
        break;
      case 'tetris':
        triggerShake(Math.min(metrics.cell * 0.34, 14), reducedMotion() ? 0 : 260);
        addParticles(reducedMotion() ? 10 : 36, metrics.left + metrics.boardWidth * 0.5,
          metrics.top + metrics.boardHeight * 0.52, metrics, {
            world,
            colors: [...particleColors(world), COLORS.seam],
            spreadX: metrics.boardWidth * 0.48,
            spreadY: metrics.boardHeight * 0.23,
            speed: randomBetween(1.5, 3.2),
            direction: -1,
            life: reducedMotion() ? 460 : randomBetween(700, 1200),
            alpha: 0.92,
          });
        break;
      case 'fold_start':
        addFoldStartRuffle(evt, G, metrics);
        flash = {
          color: palette.paper,
          strength: reducedMotion() ? 0.045 : 0.06,
          life: reducedMotion() ? 100 : 150,
          maxLife: reducedMotion() ? 100 : 150,
        };
        break;
      case 'fold_done':
        addFoldDoneBurst(evt, G, metrics);
        flash = {
          color: COLORS.seam,
          strength: reducedMotion() ? 0.045 : 0.075,
          life: reducedMotion() ? 110 : 180,
          maxLife: reducedMotion() ? 110 : 180,
        };
        break;
      case 'flip':
        // Legacy flip events are intentionally ignored in v4.
        break;
      case 'garbage':
        addParticles(reducedMotion() ? 4 : 10, metrics.left + metrics.boardWidth * 0.5,
          metrics.top + metrics.boardHeight - metrics.cell * 0.65, metrics, {
            kind: 'confetti',
            world,
            type: 'G',
            spreadX: metrics.boardWidth * 0.42,
            spreadY: metrics.cell * 0.16,
            speed: randomBetween(0.5, 1.3),
            direction: -1,
            life: reducedMotion() ? 300 : 520,
            alpha: 0.56,
          });
        triggerShake(Math.min(metrics.cell * 0.10, 4), reducedMotion() ? 0 : 110);
        break;
      case 'echo':
        addEcho(evt, G, metrics);
        break;
      case 'levelup':
        setBanner('levelup', evt, G, metrics);
        flash = {
          color: evt.phase >= 9 ? COLORS.seam : palette.paper,
          strength: reducedMotion() ? 0.10 : 0.14,
          life: reducedMotion() ? 150 : 230,
          maxLife: reducedMotion() ? 150 : 230,
        };
        break;
      case 'hold':
        addParticles(reducedMotion() ? 3 : 6, point[0], point[1], metrics, {
          kind: 'puff',
          world,
          colors: [palette.paper, palette.ink],
          spreadX: metrics.cell * 0.32,
          spreadY: metrics.cell * 0.25,
          size: metrics.cell * 0.12,
          speed: 0.9,
          direction: -1,
          gravity: 0,
          life: reducedMotion() ? 220 : 360,
          alpha: 0.50,
        });
        break;
      case 'foldover':
        flash = {
          color: COLORS.seam,
          strength: reducedMotion() ? 0.08 : 0.16,
          life: reducedMotion() ? 120 : 190,
          maxLife: reducedMotion() ? 120 : 190,
        };
        addParticles(reducedMotion() ? 4 : 10, point[0], point[1], metrics, {
          kind: 'spark',
          world,
          colors: [COLORS.seam, palette.ink],
          spreadX: metrics.cell * 0.75,
          spreadY: metrics.cell * 0.25,
          width: metrics.cell * 0.24,
          height: metrics.cell * 0.06,
          speed: 1.1,
          direction: -1,
          gravity: 0,
          life: reducedMotion() ? 240 : 400,
          alpha: 0.72,
        });
        break;
      case 'charge':
        addChargeSparks(evt, G, metrics);
        break;
      case 'seamwin':
        finale = {
          life: reducedMotion() ? 1500 : 2800,
          maxLife: reducedMotion() ? 1500 : 2800,
        };
        setBanner('seamwin', evt, G, metrics);
        flash = { color: COLORS.seam, strength: reducedMotion() ? 0.12 : 0.20, life: 260, maxLife: 260 };
        addParticles(reducedMotion() ? 24 : 100, metrics.left + metrics.boardWidth * 0.5,
          metrics.top + metrics.boardHeight * 0.5, metrics, {
            world,
            colors: [COLORS.seam, '#fff0a8', ...particleColors(world)],
            spreadX: metrics.boardWidth * 0.49,
            spreadY: metrics.boardHeight * 0.40,
            speed: randomBetween(1.5, 4.1),
            direction: -1,
            life: reducedMotion() ? 700 : randomBetween(1000, 1900),
            alpha: 0.95,
          });
        triggerShake(Math.min(metrics.cell * 0.30, 12), reducedMotion() ? 0 : 300);
        break;
      case 'gameover':
        setBanner('gameover', evt, G, metrics);
        flash = { color: palette.garbage, strength: 0.12, life: 260, maxLife: 260 };
        break;
      case 'move':
      case 'rotate':
        // Movement events are intentionally quiet; their frequency is tied to
        // DAS and adding particles here would cost more attention than juice.
        break;
      default:
        break;
    }
  }

  function update(dtMs) {
    const dt = clamp(Number(dtMs) || 0, 0, 50);
    let write = 0;
    for (let i = 0; i < particles.length; i += 1) {
      const particle = particles[i];
      particle.life -= dt;
      if (particle.life <= 0) continue;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= particle.drag ** (dt / 16.67);
      particle.vy = particle.vy * (particle.drag ** (dt / 16.67)) + particle.gravity * dt;
      particle.rotation += particle.spin * dt;
      particles[write] = particle;
      write += 1;
    }
    particles.length = write;

    write = 0;
    for (let i = 0; i < strips.length; i += 1) {
      const strip = strips[i];
      strip.life -= dt;
      if (strip.life <= 0) continue;
      strips[write] = strip;
      write += 1;
    }
    strips.length = write;

    write = 0;
    for (let i = 0; i < arcs.length; i += 1) {
      const arc = arcs[i];
      arc.life -= dt;
      if (arc.life <= 0) continue;
      arcs[write] = arc;
      write += 1;
    }
    arcs.length = write;

    write = 0;
    for (let i = 0; i < banners.length; i += 1) {
      const banner = banners[i];
      banner.life -= dt;
      if (banner.life <= 0) continue;
      banners[write] = banner;
      write += 1;
    }
    banners.length = write;

    if (flash) {
      flash.life -= dt;
      if (flash.life <= 0) flash = null;
    }
    if (finale) {
      finale.life -= dt;
      if (finale.life <= 0) finale = null;
    }
    if (shakeTime > 0) {
      shakeTime = Math.max(0, shakeTime - dt);
      if (shakeTime === 0) {
        shakeDuration = 0;
        shakeAmplitude = 0;
      }
    }
  }

  function reset() {
    particles.length = 0;
    strips.length = 0;
    arcs.length = 0;
    banners.length = 0;
    flash = null;
    finale = null;
    shakeTime = 0;
    shakeDuration = 0;
    shakeAmplitude = 0;
    shakePhase = 0;
  }

  function draw(ctx) {
    if (!ctx) return;
    const metrics = boardMetrics(canvas);
    if (!particles.length && !strips.length && !arcs.length && !banners.length && !flash && !finale) return;

    ctx.save();
    ctx.setLineDash([]);
    for (const strip of strips) drawTearStrip(ctx, strip, metrics);
    for (const arc of arcs) drawEchoArc(ctx, arc, metrics);
    if (finale) drawFinale(ctx, finale, metrics);
    if (flash) drawFlash(ctx, flash, metrics);
    for (const particle of particles) drawParticle(ctx, particle);
    for (const banner of banners) drawBanner(ctx, banner, metrics);
    ctx.restore();
  }

  function shakeOffset() {
    if (reducedMotion() || shakeTime <= 0 || shakeDuration <= 0) return [0, 0];
    const envelope = (shakeTime / shakeDuration) ** 2;
    const phase = shakePhase + (shakeDuration - shakeTime) * 0.075;
    return [
      Math.sin(phase * 1.71) * shakeAmplitude * envelope,
      Math.cos(phase * 2.13) * shakeAmplitude * envelope * 0.74,
    ];
  }

  return { handle, update, draw, shakeOffset, reset };
}
