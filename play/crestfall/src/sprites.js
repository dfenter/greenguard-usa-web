// Pixel art sprite definitions and rendering
// All sprites drawn procedurally on canvas (no external assets)
// Coordinates in NES pixels; caller passes scale factor

import { SCALE } from './constants.js';

const S = SCALE;

// Helper: draw a pixel (NES-space)
function px(ctx, x, y, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x * S, y * S, S, S);
}

// Helper: draw a row of pixels from a binary string ('1'=color, '0'=skip)
function row(ctx, x, y, str, color, bg = null) {
  for (let i = 0; i < str.length; i++) {
    if (str[i] === '1' && color) px(ctx, x + i, y, color);
    else if (str[i] === '0' && bg) px(ctx, x + i, y, bg);
  }
}

// ---- HERO sprites (facing right) ----

export function drawLink(ctx, sx, sy, frame = 0, facing = 1, state = 'stand') {
  // Hero sprites are drawn facing right; flip canvas for left-facing.
  ctx.save();
  if (facing === -1) {
    // Flip around the sprite's horizontal center (sprite is ~10px wide, center at sx+5)
    ctx.translate((sx + 5) * S, 0);
    ctx.scale(-1, 1);
    ctx.translate(-(sx + 5) * S, 0);
  }

  const skin = '#F0B078';
  const hat  = '#6844FC';
  const tunic = '#6844FC';
  const belt = '#F8D878';
  const boot = '#2800A8';
  const sword = '#B8F0F8';
  const shield = '#E87818';

  if (state === 'stand' || state === 'walk') {
    const legPhase = (state === 'walk') ? frame : 0;
    // Head
    row(ctx, sx+2, sy+0, '0111100', skin);
    row(ctx, sx+1, sy+1, '0111110', skin);
    row(ctx, sx+1, sy+2, '1111110', hat);
    row(ctx, sx+0, sy+3, '11111110', hat);
    // Body
    row(ctx, sx+1, sy+4, '0111110', tunic);
    row(ctx, sx+1, sy+5, '1111110', tunic);
    row(ctx, sx+1, sy+6, '0111110', belt);
    // Legs
    if (legPhase === 0) {
      row(ctx, sx+1, sy+7, '0110110', tunic);
      row(ctx, sx+1, sy+8, '0110110', boot);
      row(ctx, sx+1, sy+9, '0110110', boot);
    } else {
      row(ctx, sx+1, sy+7, '0111100', tunic);
      row(ctx, sx+1, sy+8, '0001100', boot);
      row(ctx, sx+1, sy+9, '0110000', boot);
    }
    // Sword (right side)
    row(ctx, sx+7, sy+4, '1', sword);
    row(ctx, sx+8, sy+5, '1', sword);
    row(ctx, sx+9, sy+6, '1', sword);
    // Shield (left)
    row(ctx, sx+0, sy+4, '1', shield);
    row(ctx, sx+0, sy+5, '1', shield);
    row(ctx, sx+0, sy+6, '1', shield);

  } else if (state === 'jump') {
    // Head
    row(ctx, sx+2, sy+0, '0111100', skin);
    row(ctx, sx+1, sy+1, '0111110', skin);
    row(ctx, sx+1, sy+2, '1111110', hat);
    // Body (arms up)
    row(ctx, sx+0, sy+3, '11111111', hat);
    row(ctx, sx+1, sy+4, '0111110', tunic);
    row(ctx, sx+0, sy+5, '11111110', tunic);
    // Legs tucked
    row(ctx, sx+2, sy+6, '111111', boot);
    row(ctx, sx+2, sy+7, '111111', boot);

  } else if (state === 'crouch') {
    // Head lower
    row(ctx, sx+2, sy+2, '0111100', skin);
    row(ctx, sx+1, sy+3, '0111110', skin);
    row(ctx, sx+1, sy+4, '1111110', hat);
    // Crouched body
    row(ctx, sx+1, sy+5, '0111110', tunic);
    row(ctx, sx+1, sy+6, '0110110', boot);
    row(ctx, sx+1, sy+7, '0110110', boot);
    // Sword horizontal
    row(ctx, sx+7, sy+5, '111', sword);

  } else if (state === 'attack') {
    // Attack frame - sword extended
    row(ctx, sx+2, sy+0, '0111100', skin);
    row(ctx, sx+1, sy+1, '0111110', skin);
    row(ctx, sx+1, sy+2, '1111110', hat);
    row(ctx, sx+0, sy+3, '11111110', hat);
    row(ctx, sx+1, sy+4, '0111110', tunic);
    row(ctx, sx+1, sy+5, '1111110', tunic);
    row(ctx, sx+1, sy+6, '0111110', belt);
    row(ctx, sx+1, sy+7, '0110110', tunic);
    row(ctx, sx+1, sy+8, '0110110', boot);
    row(ctx, sx+1, sy+9, '0110110', boot);
    // Extended sword
    row(ctx, sx+7, sy+4, '111111', sword);

  } else if (state === 'attackup') {
    // Upward thrust
    row(ctx, sx+2, sy+0, '0111100', skin);
    row(ctx, sx+1, sy+1, '0111110', skin);
    row(ctx, sx+1, sy+2, '1111110', hat);
    row(ctx, sx+0, sy+3, '11111110', hat);
    row(ctx, sx+1, sy+4, '0111110', tunic);
    row(ctx, sx+1, sy+5, '1111110', tunic);
    row(ctx, sx+1, sy+6, '0111110', belt);
    row(ctx, sx+1, sy+7, '0110110', tunic);
    row(ctx, sx+1, sy+8, '0110110', boot);
    row(ctx, sx+1, sy+9, '0110110', boot);
    // Sword pointing up
    px(ctx, sx+7, sy-2, sword);
    px(ctx, sx+7, sy-1, sword);
    px(ctx, sx+7, sy+0, sword);
    px(ctx, sx+7, sy+1, sword);
    px(ctx, sx+7, sy+2, sword);

  } else if (state === 'attackdown') {
    // Downward stab (in air)
    row(ctx, sx+2, sy+0, '0111100', skin);
    row(ctx, sx+1, sy+1, '0111110', skin);
    row(ctx, sx+1, sy+2, '1111110', hat);
    row(ctx, sx+0, sy+3, '11111110', hat);
    row(ctx, sx+1, sy+4, '0111110', tunic);
    row(ctx, sx+1, sy+5, '1111110', tunic);
    row(ctx, sx+1, sy+6, '0111110', belt);
    row(ctx, sx+1, sy+7, '0110110', tunic);
    row(ctx, sx+1, sy+8, '0110110', boot);
    // Downward sword
    px(ctx, sx+5, sy+8,  sword);
    px(ctx, sx+5, sy+9,  sword);
    px(ctx, sx+5, sy+10, sword);
    px(ctx, sx+5, sy+11, sword);

  } else if (state === 'damage') {
    // Flash white
    const c = '#FCFCFC';
    row(ctx, sx+2, sy+0, '0111100', c);
    row(ctx, sx+1, sy+1, '0111110', c);
    row(ctx, sx+1, sy+2, '1111110', c);
    row(ctx, sx+0, sy+3, '11111110', c);
    row(ctx, sx+1, sy+4, '0111110', c);
    row(ctx, sx+1, sy+5, '1111110', c);
    row(ctx, sx+1, sy+6, '0111110', c);
    row(ctx, sx+1, sy+7, '0110110', c);
    row(ctx, sx+1, sy+8, '0110110', c);
    row(ctx, sx+1, sy+9, '0110110', c);
  }

  ctx.restore();
}

// ---- BONEWARD ----
export function drawStalfos(ctx, sx, sy, frame = 0) {
  const bone = '#E8E8E8';
  const eye  = '#D81818';
  const sword = '#D8D8D8';
  const shield = '#884400';

  // Skull
  row(ctx, sx+1, sy+0, '011110', bone);
  row(ctx, sx+1, sy+1, '111111', bone);
  row(ctx, sx+0, sy+2, '11111110', bone);
  row(ctx, sx+0, sy+3, '11111110', bone);
  // Eyes
  px(ctx, sx+1, sy+2, eye);
  px(ctx, sx+5, sy+2, eye);
  // Jaw
  row(ctx, sx+1, sy+4, '010010', bone);
  // Ribcage
  row(ctx, sx+1, sy+5, '111110', bone);
  row(ctx, sx+0, sy+6, '11010110', bone);
  row(ctx, sx+1, sy+7, '111110', bone);
  // Pelvis
  row(ctx, sx+1, sy+8, '111110', bone);
  // Legs
  if (frame === 0) {
    row(ctx, sx+1, sy+9,  '010010', bone);
    row(ctx, sx+1, sy+10, '110001', bone);
    row(ctx, sx+1, sy+11, '110001', bone);
  } else {
    row(ctx, sx+1, sy+9,  '011100', bone);
    row(ctx, sx+1, sy+10, '001100', bone);
    row(ctx, sx+2, sy+11, '110000', bone);
  }
  // Sword right
  row(ctx, sx+7, sy+4, '111', sword);
  // Shield left
  row(ctx, sx+0, sy+5, '1', shield);
  row(ctx, sx+0, sy+6, '1', shield);
  row(ctx, sx+0, sy+7, '1', shield);
}

// ---- HEXWEAVER ----
export function drawWizzrobe(ctx, sx, sy, frame = 0) {
  const robe  = '#6844FC';
  const face  = '#F8B048';
  const hat   = '#400080';
  const magic = '#00E8D8';

  // Hat
  row(ctx, sx+2, sy+0, '01100', hat);
  row(ctx, sx+1, sy+1, '011100', hat);
  row(ctx, sx+0, sy+2, '11111110', hat);
  // Head
  row(ctx, sx+1, sy+3, '011110', face);
  row(ctx, sx+1, sy+4, '011110', face);
  // Eyes glow
  px(ctx, sx+2, sy+3, magic);
  px(ctx, sx+5, sy+3, magic);
  // Robe
  row(ctx, sx+0, sy+5, '11111110', robe);
  row(ctx, sx+1, sy+6, '0111110', robe);
  row(ctx, sx+1, sy+7, '0111110', robe);
  row(ctx, sx+1, sy+8, '0111110', robe);
  row(ctx, sx+0, sy+9, '11010110', robe);
  row(ctx, sx+0, sy+10,'11010110', robe);
  // Staff
  if (frame === 0) {
    px(ctx, sx+8, sy+4, '#D8D8D8');
    px(ctx, sx+8, sy+5, '#D8D8D8');
    px(ctx, sx+8, sy+6, '#D8D8D8');
  }
}

// ---- IRONWRAITH ----
export function drawIronknuckle(ctx, sx, sy, frame = 0) {
  const armor  = '#D8D8D8';
  const helmet = '#808080';
  const visor  = '#0058F8';
  const sword  = '#F8F8D8';
  const red    = '#D81818';

  // Helmet
  row(ctx, sx+1, sy+0, '0111110', helmet);
  row(ctx, sx+0, sy+1, '11111110', helmet);
  row(ctx, sx+0, sy+2, '11111110', helmet);
  // Visor
  row(ctx, sx+2, sy+1, '011110', visor);
  // Body
  row(ctx, sx+0, sy+3, '11111110', armor);
  row(ctx, sx+0, sy+4, '11111110', armor);
  row(ctx, sx+1, sy+5, '0111110', armor);
  // Belt
  row(ctx, sx+1, sy+6, '0111110', red);
  // Legs
  if (frame === 0) {
    row(ctx, sx+1, sy+7, '011110', armor);
    row(ctx, sx+1, sy+8, '011110', armor);
    row(ctx, sx+1, sy+9, '010010', armor);
  } else {
    row(ctx, sx+1, sy+7, '011100', armor);
    row(ctx, sx+1, sy+8, '001110', armor);
    row(ctx, sx+1, sy+9, '110010', armor);
  }
  // Sword
  row(ctx, sx+8, sy+2, '1111', sword);
  // Shield
  row(ctx, sx+0, sy+3, '1', '#0058F8');
  row(ctx, sx+0, sy+4, '1', '#0058F8');
  row(ctx, sx+0, sy+5, '1', '#0058F8');
}

// ---- ACHE (bat) ----
export function drawAche(ctx, sx, sy, frame = 0) {
  const body = '#400080';
  const wing = '#6844FC';
  const eye  = '#D81818';

  if (frame === 0) {
    // Wings up
    row(ctx, sx+0, sy+0, '1110111', wing);
    row(ctx, sx+0, sy+1, '1110111', wing);
    row(ctx, sx+2, sy+2, '111', body);
    px(ctx, sx+2, sy+2, eye);
    px(ctx, sx+4, sy+2, eye);
    row(ctx, sx+2, sy+3, '111', body);
  } else {
    // Wings down
    row(ctx, sx+0, sy+2, '1110111', wing);
    row(ctx, sx+0, sy+3, '1110111', wing);
    row(ctx, sx+2, sy+0, '111', body);
    px(ctx, sx+2, sy+0, eye);
    px(ctx, sx+4, sy+0, eye);
    row(ctx, sx+2, sy+1, '111', body);
  }
}

// ---- FIRE BEAM (player's Fire spell) ----
export function drawFireball(ctx, sx, sy) {
  px(ctx, sx+0, sy+1, '#E87818');
  px(ctx, sx+1, sy+0, '#F8D878');
  px(ctx, sx+1, sy+1, '#F8D878');
  px(ctx, sx+1, sy+2, '#E87818');
  px(ctx, sx+2, sy+1, '#E87818');
}

// ---- MAGIC PROJECTILE (Wizzrobe) ----
export function drawMagicBeam(ctx, sx, sy) {
  px(ctx, sx+0, sy+1, '#6844FC');
  px(ctx, sx+1, sy+0, '#00E8D8');
  px(ctx, sx+1, sy+1, '#FCFCFC');
  px(ctx, sx+1, sy+2, '#00E8D8');
  px(ctx, sx+2, sy+1, '#6844FC');
}

// ---- SWORD BEAM (player at full health) ----
export function drawSwordBeam(ctx, sx, sy) {
  px(ctx, sx+0, sy+0, '#F8F8F8');
  px(ctx, sx+1, sy+0, '#F8D878');
  px(ctx, sx+2, sy+0, '#F8F8F8');
}

// ---- SMALL KEY ----
export function drawKey(ctx, sx, sy) {
  px(ctx, sx+1, sy+0, '#F8D878');
  px(ctx, sx+0, sy+1, '#F8D878');
  px(ctx, sx+1, sy+1, '#F8D878');
  px(ctx, sx+2, sy+1, '#F8D878');
  px(ctx, sx+1, sy+2, '#F8D878');
  px(ctx, sx+2, sy+3, '#F8D878');
  px(ctx, sx+2, sy+4, '#F8D878');
  px(ctx, sx+3, sy+3, '#F8D878');
}

// ---- SCORE SATCHEL ----
export function drawPBag(ctx, sx, sy, large = false) {
  const c = large ? '#E87818' : '#F8D878';
  px(ctx, sx+1, sy+0, c);
  px(ctx, sx+2, sy+0, c);
  row(ctx, sx+0, sy+1, '11111', c);
  row(ctx, sx+0, sy+2, '11111', c);
  row(ctx, sx+0, sy+3, '11111', c);
  row(ctx, sx+1, sy+4, '111', c);
  // S mark for score
  px(ctx, sx+1, sy+1, '#000');
  px(ctx, sx+2, sy+2, '#000');
}

// ---- KEEP BLOCK ----
export function drawPalaceBlock(ctx, sx, sy) {
  const c = '#6844FC';
  const hl = '#A888FC';
  ctx.fillStyle = c;
  ctx.fillRect(sx * S, sy * S, 16 * S, 16 * S);
  ctx.fillStyle = hl;
  ctx.fillRect(sx * S, sy * S, 16 * S, S);
  ctx.fillRect(sx * S, sy * S, S, 16 * S);
}

// ---- FIELD BLOCK (grass platform) ----
export function drawFieldBlock(ctx, sx, sy, w = 16) {
  const green = '#00A800';
  const brown = '#884000';
  ctx.fillStyle = green;
  ctx.fillRect(sx * S, sy * S, w * S, 4 * S);
  ctx.fillStyle = brown;
  ctx.fillRect(sx * S, (sy + 4) * S, w * S, 12 * S);
}

// ---- DOOR (locked) ----
export function drawDoor(ctx, sx, sy, locked = true) {
  const c = locked ? '#884400' : '#C88840';
  ctx.fillStyle = c;
  ctx.fillRect(sx * S, sy * S, 16 * S, 32 * S);
  if (locked) {
    px(ctx, sx+7, sy+14, '#000');
    px(ctx, sx+8, sy+14, '#000');
    px(ctx, sx+7, sy+15, '#000');
    px(ctx, sx+8, sy+15, '#000');
  }
}

// ---- BOSS DOOR ----
export function drawBossDoor(ctx, sx, sy) {
  ctx.fillStyle = '#A80000';
  ctx.fillRect(sx * S, sy * S, 16 * S, 32 * S);
  ctx.fillStyle = '#D81818';
  ctx.fillRect((sx+2) * S, (sy+2) * S, 12 * S, 28 * S);
}

// ---- NPC (generic townsperson) ----
export function drawNPC(ctx, sx, sy, color = '#0058F8') {
  const skin = '#F8B048';
  // Head
  px(ctx, sx+1, sy+0, skin);
  px(ctx, sx+2, sy+0, skin);
  row(ctx, sx+0, sy+1, '11110', skin);
  row(ctx, sx+0, sy+2, '11110', skin);
  // Body
  row(ctx, sx+0, sy+3, '11110', color);
  row(ctx, sx+0, sy+4, '11110', color);
  row(ctx, sx+0, sy+5, '11110', color);
  // Legs
  row(ctx, sx+0, sy+6, '10010', '#884400');
  row(ctx, sx+0, sy+7, '10010', '#884400');
}

// ---- CRYSTAL (palace collectible) ----
export function drawCrystal(ctx, sx, sy, hue = 0) {
  const colors = ['#D81818','#E87818','#F8D878','#00A800','#0058F8','#6844FC'];
  const c = colors[hue % colors.length];
  px(ctx, sx+2, sy+0, c);
  row(ctx, sx+1, sy+1, '111', c);
  row(ctx, sx+0, sy+2, '11111', c);
  row(ctx, sx+1, sy+3, '111', c);
  px(ctx, sx+2, sy+4, c);
}

// ---- CRESTFALL SIGIL ----
export function drawTriforce(ctx, sx, sy) {
  const c = '#F8D878';
  for (let y = 0; y < 8; y++) {
    const w = y * 2 + 1;
    const startX = 7 - y;
    for (let x = 0; x < w; x++) {
      px(ctx, sx + startX + x, sy + y, c);
    }
  }
  for (let y = 0; y < 8; y++) {
    const w = (7 - y) * 2 + 1;
    const startX = y;
    for (let x = 0; x < w; x++) {
      px(ctx, sx + startX + x, sy + 8 + y, c);
    }
    const startX2 = 8 + y;
    for (let x = 0; x < w; x++) {
      px(ctx, sx + startX2 + x, sy + 8 + y, c);
    }
  }
}

// ---- FONT (NES-style capital letters 5x7) ----
const GLYPHS = {
  'A': ['01110','10001','10001','11111','10001','10001','10001'],
  'B': ['11110','10001','10001','11110','10001','10001','11110'],
  'C': ['01110','10001','10000','10000','10000','10001','01110'],
  'D': ['11110','10001','10001','10001','10001','10001','11110'],
  'E': ['11111','10000','10000','11110','10000','10000','11111'],
  'F': ['11111','10000','10000','11110','10000','10000','10000'],
  'G': ['01110','10001','10000','10111','10001','10001','01110'],
  'H': ['10001','10001','10001','11111','10001','10001','10001'],
  'I': ['01110','00100','00100','00100','00100','00100','01110'],
  'J': ['00111','00001','00001','00001','10001','10001','01110'],
  'K': ['10001','10010','10100','11000','10100','10010','10001'],
  'L': ['10000','10000','10000','10000','10000','10000','11111'],
  'M': ['10001','11011','10101','10001','10001','10001','10001'],
  'N': ['10001','11001','10101','10011','10001','10001','10001'],
  'O': ['01110','10001','10001','10001','10001','10001','01110'],
  'P': ['11110','10001','10001','11110','10000','10000','10000'],
  'Q': ['01110','10001','10001','10001','10101','10010','01101'],
  'R': ['11110','10001','10001','11110','10100','10010','10001'],
  'S': ['01110','10001','10000','01110','00001','10001','01110'],
  'T': ['11111','00100','00100','00100','00100','00100','00100'],
  'U': ['10001','10001','10001','10001','10001','10001','01110'],
  'V': ['10001','10001','10001','10001','10001','01010','00100'],
  'W': ['10001','10001','10001','10101','10101','11011','10001'],
  'X': ['10001','10001','01010','00100','01010','10001','10001'],
  'Y': ['10001','10001','01010','00100','00100','00100','00100'],
  'Z': ['11111','00001','00010','00100','01000','10000','11111'],
  '0': ['01110','10001','10011','10101','11001','10001','01110'],
  '1': ['00100','01100','00100','00100','00100','00100','01110'],
  '2': ['01110','10001','00001','00010','00100','01000','11111'],
  '3': ['11111','00001','00010','00110','00001','10001','01110'],
  '4': ['00010','00110','01010','10010','11111','00010','00010'],
  '5': ['11111','10000','10000','11110','00001','00001','11110'],
  '6': ['00110','01000','10000','11110','10001','10001','01110'],
  '7': ['11111','00001','00010','00100','00100','00100','00100'],
  '8': ['01110','10001','10001','01110','10001','10001','01110'],
  '9': ['01110','10001','10001','01111','00001','00010','01100'],
  ' ': ['00000','00000','00000','00000','00000','00000','00000'],
  '-': ['00000','00000','00000','11111','00000','00000','00000'],
  ':': ['00000','00100','00000','00000','00100','00000','00000'],
  '!': ['00100','00100','00100','00100','00000','00000','00100'],
  '.': ['00000','00000','00000','00000','00000','00100','00100'],
  '/': ['00001','00001','00010','00100','01000','10000','10000'],
  '*': ['00000','10101','01110','11111','01110','10101','00000'],
};

// Draw text at NES pixel position
export function drawText(ctx, text, sx, sy, color = '#FCFCFC', scale = 1) {
  const cs = S * scale; // canvas pixels per NES pixel * extra scale
  let cx = sx;
  for (const ch of text.toUpperCase()) {
    const glyph = GLYPHS[ch] || GLYPHS[' '];
    for (let gy = 0; gy < glyph.length; gy++) {
      for (let gx = 0; gx < glyph[gy].length; gx++) {
        if (glyph[gy][gx] === '1') {
          ctx.fillStyle = color;
          ctx.fillRect((cx + gx) * cs / scale * scale, (sy + gy) * cs / scale * scale,
                       cs, cs);
        }
      }
    }
    cx += 6; // 5px glyph + 1px gap
  }
}

// Draw text in canvas-pixel coordinates (bypass NES scaling)
export function drawTextPx(ctx, text, x, y, color = '#FCFCFC', pixelSize = S) {
  let cx = x;
  for (const ch of text.toUpperCase()) {
    const glyph = GLYPHS[ch] || GLYPHS[' '];
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
