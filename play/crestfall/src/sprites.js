// Procedural arcade sprite sheet. Every silhouette is authored in code so the
// title has no remote art dependency and keeps its neon-on-dark identity.

import { SCALE } from './constants.js';

const S = SCALE;
const PAL = {
  ink: '#070a18',
  white: '#F3FBFF',
  cyan: '#42F5E6',
  blue: '#4D8DFF',
  violet: '#9B6CFF',
  pink: '#FF5CCB',
  orange: '#FF9A52',
  gold: '#FFE18A',
  red: '#FF557A',
  green: '#5CFF9B',
  slate: '#5B678D',
};

function px(ctx, x, y, color, size = 1) {
  ctx.fillStyle = color;
  ctx.fillRect(x * S, y * S, size * S, size * S);
}

function rect(ctx, x, y, w, h, color, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(x * S, y * S, w * S, h * S);
  ctx.restore();
}

function glow(ctx, x, y, radius, color, alpha = 0.35) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const gradient = ctx.createRadialGradient(x * S, y * S, 0, x * S, y * S, radius * S);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = alpha;
  ctx.fillStyle = gradient;
  ctx.fillRect((x - radius) * S, (y - radius) * S, radius * 2 * S, radius * 2 * S);
  ctx.restore();
}

function pixelRows(ctx, x, y, rows, color, alt) {
  rows.forEach((line, row) => {
    for (let col = 0; col < line.length; col++) {
      if (line[col] === '1') px(ctx, x + col, y + row, color);
      if (line[col] === '2' && alt) px(ctx, x + col, y + row, alt);
    }
  });
}

export function drawPlayer(ctx, sx, sy, frame = 0, facing = 1, state = 'stand', attackPhase = 'ready', equipment = 'EMBERCLOAK') {
  ctx.save();
  if (facing < 0) {
    ctx.translate((sx + 7) * S, 0);
    ctx.scale(-1, 1);
    ctx.translate(-(sx + 7) * S, 0);
  }
  const equipmentColor = {
    THORNBINDER: PAL.green, SKYTHREAD: PAL.cyan, TIDEGLASS: PAL.blue, VEILPLATE: PAL.pink,
  }[equipment] || PAL.violet;
  const cloak = state === 'damage' ? PAL.white : equipmentColor;
  const trim = state === 'damage' ? PAL.white : PAL.cyan;
  pixelRows(ctx, sx + 1, sy, [
    '0011100', '0111110', '1111111', '1101011',
    '0111110', '1111111', '0122210', frame ? '0110110' : '0101010',
    frame ? '0011000' : '0110010', '0110110',
  ], cloak, trim);
  rect(ctx, sx + 2, sy + 1, 3, 2, PAL.orange);
  rect(ctx, sx + 3, sy + 3, 1, 1, PAL.gold);
  if (state === 'crouch') rect(ctx, sx + 1, sy + 7, 7, 3, PAL.ink);
  if (equipment === 'THORNBINDER') {
    rect(ctx, sx, sy + 4, 1, 5, PAL.green);
    rect(ctx, sx + 7, sy + 4, 1, 5, PAL.green);
  } else if (equipment === 'SKYTHREAD') {
    rect(ctx, sx + 1, sy + 9, 2, 2, PAL.cyan);
    rect(ctx, sx + 6, sy + 9, 2, 2, PAL.cyan);
  } else if (equipment === 'TIDEGLASS') {
    rect(ctx, sx + 2, sy + 6, 4, 1, PAL.blue);
  } else if (equipment === 'VEILPLATE') {
    rect(ctx, sx + 2, sy + 5, 1, 4, PAL.pink);
    rect(ctx, sx + 6, sy + 5, 1, 4, PAL.pink);
  }

  if (attackPhase === 'windup') {
    glow(ctx, sx + 8, sy + 6, 8, PAL.gold, 0.2);
    rect(ctx, sx + 7, sy + 5, 2, 1, PAL.gold);
  } else if (attackPhase === 'active') {
    glow(ctx, sx + 13, sy + 6, 11, PAL.cyan, 0.35);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = PAL.white;
    ctx.lineWidth = 2 * S;
    ctx.beginPath();
    ctx.arc((sx + 7) * S, (sy + 7) * S, 12 * S, -0.72, 0.72);
    ctx.stroke();
    ctx.restore();
  } else if (attackPhase === 'recovery') {
    rect(ctx, sx + 7, sy + 7, 5, 1, PAL.slate);
    rect(ctx, sx + 8, sy + 8, 2, 1, PAL.slate);
  }
  if (state === 'jump') {
    rect(ctx, sx + 1, sy + 10, 3, 1, PAL.cyan);
    rect(ctx, sx + 6, sy + 10, 3, 1, PAL.cyan);
  }
  ctx.restore();
}

export function drawGuardian(ctx, type, sx, sy, frame = 0, phase = 0, telegraph = 0, blocking = false, state = 'idle') {
  const palette = {
    duskwing: [PAL.violet, PAL.pink, PAL.cyan],
    boneward: [PAL.white, PAL.slate, PAL.red],
    hexweaver: [PAL.violet, PAL.cyan, PAL.gold],
    ironwraith: [PAL.slate, PAL.blue, PAL.orange],
    brineclaw: [PAL.green, PAL.cyan, PAL.orange],
    crescent: [PAL.orange, PAL.gold, PAL.green],
    ravenhorse: [PAL.red, PAL.gold, PAL.violet],
    crownback: [PAL.orange, PAL.red, PAL.gold],
    umbrakin: [PAL.pink, PAL.violet, PAL.cyan],
    stonevex: [PAL.orange, PAL.slate, PAL.gold],
    ironroot: [PAL.red, PAL.orange, PAL.white],
    tidebane: [PAL.blue, PAL.cyan, PAL.white],
  }[type] || [PAL.red, PAL.gold, PAL.white];
  const [body, trim, eye] = palette;
  const boss = type === 'ravenhorse' || type === 'crownback' || type === 'umbrakin' || type === 'stonevex' || type === 'ironroot' || type === 'tidebane';
  const scale = boss ? 1.35 : 1;
  const w = boss ? 18 : 12;
  const h = boss ? 20 : 15;
  const bob = state === 'jump' ? -2 : state === 'windup' ? 2 : state === 'attack' ? (frame % 2 ? -1 : 1) : state === 'recovery' ? 1 : state === 'damage' ? 1 : (frame % 2 ? 0 : 1);
  sy += bob;
  glow(ctx, sx + w / 2, sy + h / 2, boss ? 18 : 10, trim, boss ? 0.18 : 0.1);
  rect(ctx, sx + 2, sy + 2, w - 4, h - 4, PAL.ink);
  if (type === 'duskwing') {
    pixelRows(ctx, sx, sy + 4, ['1100011', '1110111', '0111110', '0011100'], body, trim);
    px(ctx, sx + 2, sy + 5, eye); px(ctx, sx + 4, sy + 5, eye);
  } else if (type === 'hexweaver') {
    pixelRows(ctx, sx + 1, sy, ['0001100', '0011110', '1111111', '0111110', '1111111', '0111110', '0111110', '1110111'], trim, body);
    px(ctx, sx + 3, sy + 3, eye); px(ctx, sx + 5, sy + 3, eye);
  } else if (type === 'brineclaw') {
    pixelRows(ctx, sx + 1, sy, ['0111110', '1111111', '0211120', '1111111', '0111110', '1101011', '0101010', '1100011'], body, trim);
    rect(ctx, sx + 3, sy + 2, 1, 1, eye); rect(ctx, sx + 6, sy + 2, 1, 1, eye);
  } else {
    pixelRows(ctx, sx + 1, sy, boss ? [
      '0011111100', '0111111110', '1111111111', '1122222111',
      '1111111111', '0111111110', '0111221110', '1100000011',
      '1100000011', '0110000110', '0110000110',
    ] : [
      '0111110', '1111111', '1222221', '1111111', '0111110',
      '0112210', '1100011', '0101010',
    ], body, trim);
    rect(ctx, sx + (boss ? 3 : 2), sy + 2, 1, 1, eye);
    rect(ctx, sx + (boss ? 7 : 5), sy + 2, 1, 1, eye);
    if (blocking) rect(ctx, sx - 2, sy + 5, 2, 7, trim);
  }
  if (phase > 0) rect(ctx, sx + 1, sy - 2, Math.max(4, Math.floor(w * 0.45)), 1, PAL.red);
  if (state === 'windup') {
    glow(ctx, sx + w / 2, sy + h / 2, 12, PAL.gold, 0.14);
    rect(ctx, sx + w / 2 - 4, sy - 3, 8, 1, PAL.gold);
  } else if (state === 'attack') {
    glow(ctx, sx + (w / 2), sy + h / 2, 14, PAL.gold, 0.22);
    rect(ctx, sx - 4, sy + h / 2, 3, 1, PAL.gold);
    rect(ctx, sx + w + 1, sy + h / 2, 3, 1, PAL.gold);
  } else if (state === 'recovery') {
    rect(ctx, sx - 1, sy + h + 1, w + 2, 1, PAL.slate);
  } else if (state === 'damage') {
    rect(ctx, sx - 2, sy + 2, w + 4, 1, PAL.white, 0.8);
  }
  if (telegraph > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.min(0.9, telegraph / 18);
    ctx.strokeStyle = PAL.gold;
    ctx.lineWidth = S;
    ctx.beginPath();
    ctx.arc((sx + w / 2) * S, (sy + h / 2) * S, (10 + telegraph * 0.35) * S, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  return scale;
}

export function drawTownNPC(ctx, sx, sy, color = PAL.blue, frame = 0) {
  glow(ctx, sx + 3, sy + 5, 7, color, 0.1);
  pixelRows(ctx, sx, sy, [
    '01110', '11111', '10101', '01110',
    frame ? '11111' : '01110', '01110', '11011', '10001',
  ], color, PAL.gold);
  rect(ctx, sx + 2, sy + 1, 1, 1, PAL.ink);
  rect(ctx, sx + 4, sy + 1, 1, 1, PAL.ink);
}

export function drawWorldAvatar(ctx, sx, sy, pulse = 0, equipment = 'EMBERCLOAK') {
  const color = { THORNBINDER: PAL.green, SKYTHREAD: PAL.cyan, TIDEGLASS: PAL.blue, VEILPLATE: PAL.pink }[equipment] || PAL.violet;
  glow(ctx, sx + 4, sy + 4, 12, color, 0.28);
  rect(ctx, sx + 1, sy + 1, 6, 6, color);
  rect(ctx, sx + 2, sy + 2, 4, 3, PAL.orange);
  rect(ctx, sx + 3, sy + 6, 2, 2, PAL.cyan);
  if (pulse > 0) rect(ctx, sx, sy, 8, 1, PAL.gold, pulse);
}

export function drawProjectile(ctx, sx, sy, kind = 'ember') {
  const color = kind === 'arc' ? PAL.cyan : kind === 'beam' ? PAL.violet : PAL.orange;
  glow(ctx, sx + 1, sy + 1, 7, color, 0.34);
  px(ctx, sx + 1, sy, PAL.white); px(ctx, sx, sy + 1, color);
  px(ctx, sx + 1, sy + 1, color); px(ctx, sx + 2, sy + 1, color); px(ctx, sx + 1, sy + 2, color);
}

export function drawPickup(ctx, sx, sy, type, pulse = 0) {
  const color = type === 'heart' ? PAL.red : type === 'fragment' ? PAL.gold : PAL.cyan;
  glow(ctx, sx + 4, sy + 4, 12 + pulse, color, 0.3);
  if (type === 'heart') {
    pixelRows(ctx, sx + 1, sy + 1, ['0110110', '1111111', '1111111', '0111110', '0011100'], color);
  } else if (type === 'fragment') {
    pixelRows(ctx, sx + 2, sy, ['00100', '01110', '11111', '01110', '00100'], color, PAL.white);
  } else {
    pixelRows(ctx, sx + 1, sy + 1, ['00110', '01111', '11111', '01110', '00100'], color, PAL.white);
  }
}

export function drawSigil(ctx, sx, sy, hue = 0, pulse = 0) {
  const colors = [PAL.red, PAL.orange, PAL.gold, PAL.green, PAL.blue, PAL.violet, PAL.pink];
  const color = colors[hue % colors.length];
  glow(ctx, sx + 4, sy + 4, 20 + pulse, color, 0.38);
  pixelRows(ctx, sx + 1, sy, ['0011100', '0111110', '1111111', '0111110', '0011100', '0010100'], color, PAL.white);
}

export function drawDoorGlyph(ctx, sx, sy, locked = false) {
  rect(ctx, sx, sy, 16, 32, locked ? '#32142D' : '#182944');
  rect(ctx, sx + 2, sy + 2, 12, 30, locked ? PAL.red : PAL.blue);
  rect(ctx, sx + 5, sy + 7, 6, 16, PAL.ink);
  if (locked) rect(ctx, sx + 6, sy + 14, 4, 5, PAL.gold);
}

export function drawTileSigil(ctx, sx, sy, type, pulse = 0) {
  const colors = { forest: PAL.green, mountain: PAL.slate, coast: PAL.blue, night: PAL.violet, town: PAL.gold };
  const color = colors[type] || PAL.cyan;
  glow(ctx, sx + 4, sy + 4, 10 + pulse, color, 0.18);
  rect(ctx, sx + 2, sy + 2, 4, 4, color);
  rect(ctx, sx + 3, sy + 1, 2, 6, PAL.white, 0.32);
}

const GLYPHS = {
  A: ['01110','10001','10001','11111','10001','10001','10001'], B: ['11110','10001','10001','11110','10001','10001','11110'],
  C: ['01110','10001','10000','10000','10000','10001','01110'], D: ['11110','10001','10001','10001','10001','10001','11110'],
  E: ['11111','10000','10000','11110','10000','10000','11111'], F: ['11111','10000','10000','11110','10000','10000','10000'],
  G: ['01110','10001','10000','10111','10001','10001','01110'], H: ['10001','10001','10001','11111','10001','10001','10001'],
  I: ['01110','00100','00100','00100','00100','00100','01110'], J: ['00111','00001','00001','00001','10001','10001','01110'],
  K: ['10001','10010','10100','11000','10100','10010','10001'], L: ['10000','10000','10000','10000','10000','10000','11111'],
  M: ['10001','11011','10101','10001','10001','10001','10001'], N: ['10001','11001','10101','10011','10001','10001','10001'],
  O: ['01110','10001','10001','10001','10001','10001','01110'], P: ['11110','10001','10001','11110','10000','10000','10000'],
  Q: ['01110','10001','10001','10001','10101','10010','01101'], R: ['11110','10001','10001','11110','10100','10010','10001'],
  S: ['01110','10001','10000','01110','00001','10001','01110'], T: ['11111','00100','00100','00100','00100','00100','00100'],
  U: ['10001','10001','10001','10001','10001','10001','01110'], V: ['10001','10001','10001','10001','10001','01010','00100'],
  W: ['10001','10001','10001','10101','10101','11011','10001'], X: ['10001','10001','01010','00100','01010','10001','10001'],
  Y: ['10001','10001','01010','00100','00100','00100','00100'], Z: ['11111','00001','00010','00100','01000','10000','11111'],
  0: ['01110','10001','10011','10101','11001','10001','01110'], 1: ['00100','01100','00100','00100','00100','00100','01110'],
  2: ['01110','10001','00001','00010','00100','01000','11111'], 3: ['11111','00001','00010','00110','00001','10001','01110'],
  4: ['00010','00110','01010','10010','11111','00010','00010'], 5: ['11111','10000','10000','11110','00001','00001','11110'],
  6: ['00110','01000','10000','11110','10001','10001','01110'], 7: ['11111','00001','00010','00100','00100','00100','00100'],
  8: ['01110','10001','10001','01110','10001','10001','01110'], 9: ['01110','10001','10001','01111','00001','00010','01100'],
  ' ': ['00000','00000','00000','00000','00000','00000','00000'], '-': ['00000','00000','00000','11111','00000','00000','00000'],
  ':': ['00000','00100','00000','00000','00100','00000','00000'], '!': ['00100','00100','00100','00100','00000','00000','00100'],
  '.': ['00000','00000','00000','00000','00000','00100','00100'], '/': ['00001','00001','00010','00100','01000','10000','10000'],
  '+': ['00000','00100','00100','11111','00100','00100','00000'], '%': ['11001','11010','00100','01011','10011','00000','00000'],
  '?': ['01110','10001','00001','00010','00100','00000','00100'],
};

export function drawText(ctx, text, sx, sy, color = PAL.white, scale = 1) {
  drawTextPx(ctx, text, sx * S, sy * S, color, S * scale);
}

export function drawTextPx(ctx, text, x, y, color = PAL.white, pixelSize = S) {
  let cx = x;
  for (const character of String(text).toUpperCase()) {
    const glyph = GLYPHS[character] || GLYPHS[' '];
    for (let gy = 0; gy < glyph.length; gy++) {
      for (let gx = 0; gx < glyph[gy].length; gx++) {
        if (glyph[gy][gx] === '1') {
          ctx.fillStyle = color;
          ctx.fillRect(cx + gx * pixelSize, y + gy * pixelSize, pixelSize, pixelSize);
        }
      }
    }
    cx += 6 * pixelSize;
  }
}

export function drawPixelPanel(ctx, x, y, w, h, fill = '#0B1224', stroke = PAL.cyan, alpha = 0.94) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = fill;
  ctx.fillRect(x * S, y * S, w * S, h * S);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = S;
  ctx.strokeRect((x + 0.5) * S, (y + 0.5) * S, (w - 1) * S, (h - 1) * S);
  ctx.restore();
}
