// Compact HUD and edge feedback for the arcade lane.

import { SCALE, NES_W, SPELLS, XP_TABLE } from './constants.js';
import { drawPixelPanel, drawSigil, drawTextPx } from './sprites.js';

const S = SCALE;
const COLORS = { ink: '#070A18', white: '#F3FBFF', cyan: '#42F5E6', blue: '#4D8DFF', violet: '#9B6CFF', gold: '#FFE18A', red: '#FF557A', green: '#5CFF9B', dim: '#68779D' };

function bar(ctx, x, y, w, h, fraction, color, back = '#1A2340') {
  ctx.fillStyle = back;
  ctx.fillRect(x * S, y * S, w * S, h * S);
  ctx.fillStyle = color;
  ctx.fillRect(x * S, y * S, Math.max(0, Math.floor(w * Math.max(0, Math.min(1, fraction)))) * S, h * S);
  ctx.fillStyle = 'rgba(255,255,255,.22)';
  ctx.fillRect(x * S, y * S, Math.max(1, Math.floor(w * Math.max(0, Math.min(1, fraction))) * S), S);
}

function nextXP(player) {
  let threshold = Infinity;
  for (const attr of ['atk', 'mag', 'lif']) {
    const level = player[`${attr}Lvl`];
    if (level < 8) threshold = Math.min(threshold, XP_TABLE[attr][level]);
  }
  return threshold;
}

function compactNumber(value) {
  const number = Math.max(0, Math.floor(Number(value) || 0));
  if (number < 1000) return String(number);
  if (number < 10000) return `${(number / 1000).toFixed(1).replace('.0', '')}K`;
  return `${Math.floor(number / 1000)}K`;
}

function drawHeartIcon(ctx, x, y, color) {
  ctx.fillStyle = color;
  ctx.fillRect((x + 1) * S, y * S, 2 * S, S);
  ctx.fillRect((x + 4) * S, y * S, 2 * S, S);
  ctx.fillRect(x * S, (y + 1) * S, 7 * S, 2 * S);
  ctx.fillRect((x + 1) * S, (y + 3) * S, 5 * S, S);
  ctx.fillRect((x + 2) * S, (y + 4) * S, 3 * S, S);
}

function drawKeyIcon(ctx, x, y, color) {
  ctx.fillStyle = color;
  ctx.fillRect((x + 1) * S, y * S, 4 * S, 4 * S);
  ctx.fillRect((x + 4) * S, (y + 1) * S, 2 * S, 2 * S);
  ctx.fillRect((x + 5) * S, (y + 3) * S, S, 5 * S);
  ctx.fillRect((x + 6) * S, (y + 6) * S, 2 * S, S);
}

function drawFragmentIcon(ctx, x, y, color) {
  ctx.fillStyle = color;
  ctx.fillRect((x + 3) * S, y * S, 2 * S, S);
  ctx.fillRect((x + 2) * S, (y + 1) * S, 4 * S, 3 * S);
  ctx.fillRect((x + 1) * S, (y + 4) * S, 6 * S, 2 * S);
  ctx.fillRect((x + 2) * S, (y + 6) * S, 4 * S, S);
}

function drawRuneIcon(ctx, x, y, color, active = false) {
  ctx.fillStyle = color;
  ctx.fillRect((x + 2) * S, y * S, 3 * S, S);
  ctx.fillRect((x + 1) * S, (y + 1) * S, 5 * S, 4 * S);
  ctx.fillRect((x + 2) * S, (y + 5) * S, 3 * S, S);
  if (active) {
    ctx.fillStyle = COLORS.white;
    ctx.fillRect((x + 3) * S, (y + 2) * S, S, 2 * S);
  }
}

export function drawHUD(ctx, player, bestScore = 0, meta = {}) {
  ctx.fillStyle = COLORS.ink;
  ctx.fillRect(0, 0, NES_W * S, 34 * S);
  ctx.fillStyle = '#121B35';
  ctx.fillRect(0, 0, NES_W * S, S);
  ctx.fillStyle = '#202A4A';
  ctx.fillRect(0, 33 * S, NES_W * S, S);

  drawHeartIcon(ctx, 4, 4, COLORS.red);
  drawTextPx(ctx, Math.max(0, player.lives), 13 * S, 3 * S, COLORS.white, S);
  bar(ctx, 23, 4, 40, 4, player.maxHp ? player.hp / player.maxHp : 0, COLORS.red, '#32152D');
  bar(ctx, 23, 12, 40, 4, player.maxMp ? player.mp / player.maxMp : 0, COLORS.cyan, '#123344');

  const threshold = nextXP(player);
  bar(ctx, 4, 24, 18, 3, player.atkLvl / 8, COLORS.red, '#32152D');
  bar(ctx, 25, 24, 18, 3, player.magLvl / 8, COLORS.cyan, '#123344');
  bar(ctx, 46, 24, 17, 3, player.lifLvl / 8, COLORS.green, '#163625');
  bar(ctx, 4, 29, 59, 2, threshold === Infinity ? 1 : player.xp / threshold, COLORS.green);

  const spellName = player.selectedSpell ? (SPELLS[player.selectedSpell]?.name || player.selectedSpell) : 'WARD';
  const cooldown = player.selectedSpell ? (player.runeCooldowns?.[player.selectedSpell] || 0) : 0;
  drawRuneIcon(ctx, 72, 4, cooldown ? COLORS.red : COLORS.violet, !!(player.activeSpells && Object.keys(player.activeSpells).length));
  drawTextPx(ctx, spellName.slice(0, 5), 82 * S, 3 * S, cooldown ? COLORS.red : COLORS.white, 2 * S);
  if (cooldown) drawTextPx(ctx, cooldown, 82 * S, 20 * S, COLORS.red, S);

  for (let i = 0; i < 7; i++) drawSigil(ctx, 146 + i * 6, 4, i, i < player.crystals ? 2 : 0);
  drawTextPx(ctx, `${player.crystals}/7`, 156 * S, 20 * S, COLORS.gold, S);
  drawKeyIcon(ctx, 196, 4, COLORS.cyan);
  drawTextPx(ctx, Math.max(0, player.keys || 0), 206 * S, 4 * S, COLORS.white, S);
  drawFragmentIcon(ctx, 220, 4, COLORS.gold);
  drawTextPx(ctx, Math.max(0, player.sigilFragments || 0), 230 * S, 4 * S, COLORS.white, S);
}

export function drawTutorialStrip(ctx, step, reducedMotion = false, timer = 0) {
  if (step >= 4 || timer <= 0) return false;
  const labels = ['MOVE: STICK/ARROWS', 'JUMP: Z / JUMP', 'ATTACK: X / ATTACK', 'RUNE: MENU + JUMP'];
  const label = labels[step] || labels[0];
  const alpha = reducedMotion ? 0.35 : Math.max(0.12, Math.min(0.72, 0.18 + timer / 180 * 0.54));
  drawPixelPanel(ctx, 6, 36, 244, 12, '#0B1224', COLORS.cyan, alpha);
  drawTextPx(ctx, label, 12 * S, 38 * S, COLORS.white, 2 * S);
  return true;
}

export function drawBanner(ctx, banner, reducedMotion = false) {
  if (!banner || banner.timer <= 0) return;
  const duration = banner.duration || 60;
  const text = String(banner.text || banner.title || '').toUpperCase().slice(0, 18);
  const width = Math.min(NES_W - 12, text.length * 12 + 12);
  const x = NES_W - width - 6;
  const y = 36;
  const color = banner.color || COLORS.gold;
  const fade = Math.min(0.9, banner.timer / 10);
  const alpha = reducedMotion ? fade : Math.max(0.12, fade);
  drawPixelPanel(ctx, x, y, width, 12, '#0A1024', color, alpha);
  drawTextPx(ctx, text, (x + 6) * S, (y + 2) * S, COLORS.white, 2 * S);
}

export function drawSpellSelect(ctx, player) {
  ctx.fillStyle = 'rgba(3,6,17,.96)';
  ctx.fillRect(0, 0, NES_W * S, 224 * S);
  drawPixelPanel(ctx, 22, 18, 212, 174, '#0D1730', COLORS.violet, 1);
  drawTextPx(ctx, 'RUNE LOADOUT', 76 * S, 28 * S, COLORS.gold, S);
  Object.values(SPELLS).forEach((spell, i) => {
    const col = i < 4 ? 0 : 1;
    const row = i % 4;
    const x = 36 + col * 104;
    const y = 52 + row * 28;
    const known = !!player.spells[Object.keys(SPELLS)[i]];
    const selected = player.selectedSpell === Object.keys(SPELLS)[i];
    if (selected) drawPixelPanel(ctx, x - 8, y - 5, 94, 20, '#18244A', COLORS.cyan, 0.95);
    drawTextPx(ctx, selected ? '> ' : '  ', x * S, y * S, COLORS.cyan, S);
    drawTextPx(ctx, known ? spell.name : 'LOCKED', (x + 12) * S, y * S, known ? spell.color : COLORS.dim, S);
    drawTextPx(ctx, known ? `${spell.cost}` : '-', (x + 73) * S, y * S, COLORS.white, S);
  });
  drawTextPx(ctx, 'JUMP USE  MENU CLOSE', 62 * S, 178 * S, COLORS.dim, S);
}

export function drawLevelUp(ctx, player, selectedAttr) {
  drawPixelPanel(ctx, 30, 76, 196, 112, '#0D1730', COLORS.gold, 1);
  drawTextPx(ctx, 'UPGRADE READY', 72 * S, 88 * S, COLORS.gold, S);
  const opts = [
    { key: 'atk', label: `FORCE ${player.atkLvl + 1}`, color: COLORS.red },
    { key: 'mag', label: `ARC ${player.magLvl + 1}`, color: COLORS.cyan },
    { key: 'lif', label: `VITAL ${player.lifLvl + 1}`, color: COLORS.green },
  ];
  opts.forEach((opt, i) => {
    const y = 108 + i * 19;
    if (opt.key === selectedAttr) drawPixelPanel(ctx, 46, y - 3, 164, 16, '#1A2850', opt.color, 0.95);
    drawTextPx(ctx, `${opt.key === selectedAttr ? '>' : ' '} ${opt.label}`, 54 * S, y * S, opt.color, S);
  });
  drawTextPx(ctx, 'JUMP SELECT', 86 * S, 172 * S, COLORS.dim, S);
}

export function drawGameOver(ctx, player, bestScore = 0) {
  ctx.fillStyle = '#050710';
  ctx.fillRect(0, 0, NES_W * S, 224 * S);
  drawPixelPanel(ctx, 34, 62, 188, 112, '#0D1730', COLORS.red, 1);
  drawTextPx(ctx, 'RUN ENDED', 82 * S, 86 * S, COLORS.red, 2 * S);
  drawTextPx(ctx, player.lives > 0 ? 'RETRY FROM EMBERWILD' : 'THE SIGNAL FADES', 48 * S, 120 * S, COLORS.white, S);
  drawTextPx(ctx, `SCORE ${compactNumber(player.score)}  BEST ${compactNumber(bestScore)}`, 48 * S, 144 * S, COLORS.gold, S);
  drawTextPx(ctx, `SIGILS ${player.crystals}/7`, 88 * S, 158 * S, COLORS.cyan, S);
  drawTextPx(ctx, 'PRESS ANY ACTION', 74 * S, 168 * S, COLORS.white, S);
}

export function drawWin(ctx, timer, player = {}, bestScore = 0) {
  ctx.fillStyle = '#050710';
  ctx.fillRect(0, 0, NES_W * S, 224 * S);
  const pulse = Math.sin(timer * 0.05) * 3;
  drawSigil(ctx, 124, 58, 6, pulse);
  drawTextPx(ctx, 'EMBERWILD ENDURES', 58 * S, 126 * S, COLORS.gold, S);
  if (timer > 100) drawTextPx(ctx, 'ALL SIGILS UNITED', 72 * S, 146 * S, COLORS.cyan, S);
  if (timer > 120) drawTextPx(ctx, `SCORE ${compactNumber(player.score)}  BEST ${compactNumber(bestScore)}`, 48 * S, 166 * S, COLORS.gold, S);
  if (timer > 170) drawTextPx(ctx, 'PRESS ANY ACTION', 74 * S, 186 * S, COLORS.white, S);
}

export function drawTitle(ctx, frame) {
  ctx.fillStyle = '#050710';
  ctx.fillRect(0, 0, NES_W * S, 224 * S);
  const pulse = Math.sin(frame * 0.04) * 0.2 + 0.8;
  drawTextPx(ctx, 'CRESTFALL', 64 * S, 34 * S, COLORS.gold, 3 * S * pulse);
  drawTextPx(ctx, 'EMBERWILD SIGNAL', 66 * S, 80 * S, COLORS.cyan, S);
  drawSigil(ctx, 124, 104, 6, frame % 6);
  if (Math.floor(frame / 30) % 2 === 0) drawTextPx(ctx, 'PRESS ENTER TO BEGIN', 62 * S, 174 * S, COLORS.white, S);
  drawTextPx(ctx, 'MOVE  JUMP  ATTACK  RUNE', 58 * S, 198 * S, COLORS.dim, S);
}
