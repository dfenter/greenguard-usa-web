// Crestfall HUD rendering
// Top HUD: 48px tall (16 NES rows) showing lives, attack/magic/life levels, XP, health/magic bars
// Bottom is gameplay area (176px)

import { SCALE, NES_W, HUD, SPELLS, XP_TABLE } from './constants.js';
import { drawTextPx, drawCrystal } from './sprites.js';

const S = SCALE;

// Draw a bar (health or magic)
function drawBar(ctx, x, y, filled, total, fillColor, bgColor) {
  const barW = 7; // each unit = 7px wide in NES
  for (let i = 0; i < total; i++) {
    const bx = x + i * (barW + 1);
    // Background
    ctx.fillStyle = bgColor;
    ctx.fillRect(bx * S, y * S, barW * S, 3 * S);
    // Fill
    if (i < filled) {
      ctx.fillStyle = fillColor;
      ctx.fillRect(bx * S, y * S, barW * S, 3 * S);
    }
  }
}

export function drawHUD(ctx, player, bestScore = 0) {
  // HUD background
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, NES_W * S, 56 * S);

  // Run status
  drawTextPx(ctx, 'RUN', 4 * S, 4 * S, '#FCFCFC', S);
  drawTextPx(ctx, `LIVES:${player.lives}`, 28 * S, 4 * S, '#FCFCFC', S);

  // Level indicators (force, arc, vitality)
  drawTextPx(ctx, `F:${player.atkLvl}`, 4 * S, 14 * S, HUD.LEVEL_NUM, S);
  drawTextPx(ctx, `A:${player.magLvl}`, 4 * S, 24 * S, HUD.LEVEL_NUM, S);
  drawTextPx(ctx, `V:${player.lifLvl}`, 4 * S, 34 * S, HUD.LEVEL_NUM, S);

  // XP bar (how far to next level)
  drawTextPx(ctx, 'XP', 28 * S, 14 * S, '#FCFCFC', S);
  // Find lowest next level threshold
  const attrs = ['atk','mag','lif'];
  let nextThreshold = 9999;
  for (const attr of attrs) {
    const lvlKey = attr + 'Lvl';
    const cur = player[lvlKey];
    if (cur < 8) {
      const needed = XP_TABLE[attr][cur];
      if (needed < nextThreshold) nextThreshold = needed;
    }
  }
  const xpPct = nextThreshold < 9999 ? Math.min(1, player.xp / nextThreshold) : 1;
  const xpBarW = Math.floor(xpPct * 90);
  ctx.fillStyle = '#800000';
  ctx.fillRect(28 * S, 24 * S, 90 * S, 4 * S);
  ctx.fillStyle = HUD.XP_BAR;
  ctx.fillRect(28 * S, 24 * S, xpBarW * S, 4 * S);
  drawTextPx(ctx, `${player.xp}`, 28 * S, 30 * S, '#A0A0A0', S);

  // LIFE bar
  drawTextPx(ctx, 'VITAL', 130 * S, 4 * S, '#FCFCFC', S);
  const hpFraction = player.hp / player.maxHp;
  const hpBars = Math.ceil(hpFraction * player.lifeContainers);
  drawBar(ctx, 130, 14, hpBars, player.lifeContainers, HUD.LIFE_BAR, HUD.BAR_BG);

  // ARC bar
  drawTextPx(ctx, 'ARC', 130 * S, 26 * S, '#FCFCFC', S);
  const mpFraction = player.mp / player.maxMp;
  const mpBars = Math.ceil(mpFraction * player.magicContainers);
  drawBar(ctx, 130, 36, mpBars, player.magicContainers, HUD.MAGIC_BAR, HUD.BAR_BG);

  // Runes
  drawTextPx(ctx, `RUNE:${player.keys}`, 204 * S, 4 * S, '#F8D878', S);

  // Sigils (keeps cleared)
  drawTextPx(ctx, 'SIGILS', 210 * S, 14 * S, '#FCFCFC', S);
  for (let i = 0; i < 6; i++) {
    const cx = 210 + i * 8;
    if (i < player.crystals) {
      ctx.fillStyle = ['#D81818','#E87818','#F8D878','#00A800','#0058F8','#6844FC'][i];
    } else {
      ctx.fillStyle = '#444444';
    }
    ctx.fillRect(cx * S, 24 * S, 6 * S, 6 * S);
  }

  // Active spell name (if any)
  const activeList = Object.keys(player.activeSpells);
  if (activeList.length > 0) {
    drawTextPx(ctx, SPELLS[activeList[0]]?.name || activeList[0], 210 * S, 34 * S, '#00E8D8', S);
  }

  drawTextPx(ctx, `SCORE:${player.score}`, 4 * S, 44 * S, '#A0A0A0', S);
  drawTextPx(ctx, `BEST:${bestScore}`, 104 * S, 44 * S, '#A0A0A0', S);

  // Divider line between HUD and play area
  ctx.fillStyle = '#FCFCFC';
  ctx.fillRect(0, 56 * S, NES_W * S, S);
}

// Spell select screen (shown when paused)
export function drawSpellSelect(ctx, player) {
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, NES_W * S, 224 * S);

  drawTextPx(ctx, 'RUNE LOADOUT', 70 * S, 20 * S, '#F8D878', S);

  const spellList = Object.values(SPELLS);
  spellList.forEach((spell, i) => {
    const known = player.spells[spell.name];
    const col = i < 4 ? 0 : 1;
    const row = i % 4;
    const sx = 20 + col * 120;
    const sy = 50 + row * 30;
    const color = known ? spell.color : '#444444';
    drawTextPx(ctx, spell.name, sx * S, sy * S, color, S);
    if (known) {
      drawTextPx(ctx, `MP:${spell.cost}`, (sx + 60) * S, sy * S, '#FCFCFC', S);
    }
    // Selected indicator
    if (player.selectedSpell === spell.name) {
      ctx.fillStyle = '#FCFCFC';
      ctx.fillRect((sx - 8) * S, sy * S, 4 * S, 7 * S);
    }
  });

  drawTextPx(ctx, 'JUMP:USE  MENU:CLOSE', 20 * S, 200 * S, '#888888', S);
}

// Level up screen
export function drawLevelUp(ctx, player, selectedAttr) {
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 56 * S, NES_W * S, 168 * S);

  ctx.fillStyle = '#000080';
  ctx.fillRect(32 * S, 80 * S, 192 * S, 100 * S);
  ctx.strokeStyle = '#FCFCFC';
  ctx.lineWidth = S;
  ctx.strokeRect(32 * S, 80 * S, 192 * S, 100 * S);

  drawTextPx(ctx, 'LEVEL UP!', 88 * S, 92 * S, '#F8D878', S);
  drawTextPx(ctx, 'CHOOSE A STAT:', 64 * S, 108 * S, '#FCFCFC', S);

  const opts = [
    { key: 'atk', label: `FORCE   LV ${player.atkLvl+1}`, color: '#D81818' },
    { key: 'mag', label: `ARC     LV ${player.magLvl+1}`, color: '#0058F8' },
    { key: 'lif', label: `VITAL   LV ${player.lifLvl+1}`, color: '#00A800' },
  ];

  opts.forEach((o, i) => {
    const sy = 124 + i * 16;
    const active = selectedAttr === o.key;
    if (active) {
      ctx.fillStyle = '#444444';
      ctx.fillRect(40 * S, sy * S, 176 * S, 14 * S);
    }
    drawTextPx(ctx, (active ? '> ' : '  ') + o.label, 48 * S, (sy+3) * S, active ? '#FCFCFC' : o.color, S);
  });

  drawTextPx(ctx, 'JUMP TO SELECT', 72 * S, 174 * S, '#888888', S);
}

// Death screen
export function drawGameOver(ctx, player) {
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, NES_W * S, 224 * S);

  if (player.lives >= 0) {
    drawTextPx(ctx, 'GAME OVER', 80 * S, 90 * S, '#D81818', 2);
    drawTextPx(ctx, 'CONTINUE AT EMBER KEEP', 40 * S, 140 * S, '#FCFCFC', S);
    drawTextPx(ctx, 'TAP TO RISE', 82 * S, 160 * S, '#F8D878', S);
  } else {
    drawTextPx(ctx, 'GAME OVER', 80 * S, 90 * S, '#D81818', 2);
    drawTextPx(ctx, 'ALL LIVES LOST', 70 * S, 130 * S, '#FCFCFC', S);
    drawTextPx(ctx, 'TAP TO RESET', 76 * S, 155 * S, '#888888', S);
  }
}

// Win screen
export function drawWin(ctx, timer) {
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, NES_W * S, 224 * S);

  if (timer < 60) return;

  // Three-part Crestfall sigil
  const glow = Math.sin(timer * 0.05) * 50 + 150;
  ctx.fillStyle = `rgb(${Math.floor(glow)},${Math.floor(glow*0.85)},0)`;
  const shard = 28;
  // Draw three original diamond shards around a central ember.
  ctx.beginPath();
  ctx.moveTo(128 * S, 52 * S);
  ctx.lineTo((128-shard) * S, 94 * S);
  ctx.lineTo(128 * S, 82 * S);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(128 * S, 52 * S);
  ctx.lineTo(128 * S, 82 * S);
  ctx.lineTo((128+shard) * S, 94 * S);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(128 * S, 82 * S);
  ctx.lineTo((128-shard) * S, 108 * S);
  ctx.lineTo((128+shard) * S, 108 * S);
  ctx.closePath();
  ctx.fill();

  if (timer > 120) {
    drawTextPx(ctx, 'CRESTFALL ENDURES!', 54 * S, 195 * S, '#F8D878', S);
  }
  if (timer > 180) {
    drawTextPx(ctx, 'TAP TO PLAY AGAIN', 66 * S, 210 * S, '#FCFCFC', S);
  }
}

// Title screen
export function drawTitle(ctx, frame) {
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, NES_W * S, 224 * S);

  // Crestfall gold logo
  const flash = Math.floor(frame / 30) % 2 === 0;
  drawTextPx(ctx, 'CRESTFALL', 48 * S, 30 * S, '#F8D878', 3);
  drawTextPx(ctx, 'THE ASHEN FRONTIER', 38 * S, 80 * S, '#FCFCFC', S);

  drawTextPx(ctx, 'AN ORIGINAL ODYSSEY', 60 * S, 100 * S, '#888888', S);

  // Triforce logo (mini)
  ctx.fillStyle = '#F8D878';
  const cx = 128 * S;
  const base = 130 * S;
  const tw = 20 * S;
  ctx.beginPath();
  ctx.moveTo(cx, base - tw);
  ctx.lineTo(cx - tw, base);
  ctx.lineTo(cx + tw, base);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx - tw, base);
  ctx.lineTo(cx - tw*2, base + tw);
  ctx.lineTo(cx, base + tw);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx + tw, base);
  ctx.lineTo(cx, base + tw);
  ctx.lineTo(cx + tw*2, base + tw);
  ctx.closePath();
  ctx.fill();

  if (flash) {
    drawTextPx(ctx, 'PRESS ENTER TO BEGIN', 48 * S, 185 * S, '#FCFCFC', S);
  }

  drawTextPx(ctx, 'ARROW KEYS / WASD = MOVE', 20 * S, 198 * S, '#888888', S);
  drawTextPx(ctx, 'Z/SPACE = JUMP  X/ENTER = ATTACK', 2 * S, 208 * S, '#888888', S);
  drawTextPx(ctx, 'P/ESC = RUNE MENU', 68 * S, 218 * S, '#888888', S);
}
