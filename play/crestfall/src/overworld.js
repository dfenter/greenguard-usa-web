// Emberwild overworld navigation and neon map view.

import { SCALE, TILE, TILE_PROPS, NES_W, NES_H } from './constants.js';
import { WESTERN_MAP, EASTERN_MAP, TOWNS, PALACES } from './map-data.js';
import { drawTileSigil, drawWorldAvatar } from './sprites.js';
import { worldRng } from './rng.js';

const S = SCALE;
const TILE_PX = 8;

export class Overworld {
  constructor(player, options = {}) {
    this.player = player;
    this.onNotification = options.onNotification || (() => {});
    this.map = WESTERN_MAP;
    this.region = 'west';
    this.moveTimer = 0;
    this.moveCooldown = 12;
    this.pendingEncounter = null;
    this.pendingTown = null;
    this.pendingPalace = null;
    this.transitionTimer = 0;
    this.entering = false;
    this.notification = '';
    this.notifTimer = 0;
    this.camX = 0;
    this.camY = 0;
  }

  update(input) {
    if (this.entering) {
      this.transitionTimer++;
      return;
    }
    if (this.notifTimer > 0) this.notifTimer--;
    this.moveTimer = Math.max(0, this.moveTimer - 1);
    if (this.moveTimer === 0) {
      let dx = 0;
      let dy = 0;
      if (input.left) dx = -1;
      if (input.right) dx = 1;
      if (input.up) dy = -1;
      if (input.down) dy = 1;
      if (dx || dy) {
        const nx = this.player.owX + dx;
        const ny = this.player.owY + dy;
        if (ny >= 0 && ny < this.map.length && nx >= 0 && nx < this.map[0].length) {
          const tile = this.map[ny][nx];
          if (TILE_PROPS[tile]?.passable) {
            this.player.owX = nx;
            this.player.owY = ny;
            this.moveTimer = this.moveCooldown;
            this._checkTile(tile, nx, ny);
          }
        }
      }
    }
    this._updateCamera();
  }

  _checkTile(tile, x, y) {
    const town = this._findTown(x, y);
    if (town) {
      this.entering = true;
      this.transitionTimer = 0;
      this.pendingTown = town;
      return;
    }
    const palace = this._findPalace(x, y);
    if (palace) {
      const requiredSigils = palace.crystal < 0 ? palace.id - 1 : palace.crystal;
      if (this.player.crystals < requiredSigils) {
        this.showNotification(`SIGIL ${requiredSigils} REQUIRED`);
        return;
      }
      this.entering = true;
      this.transitionTimer = 0;
      this.pendingPalace = palace;
      return;
    }
    if (tile === TILE.BRIDGE && x >= this.map[0].length - 3) {
      if (this.region === 'west') {
        this.region = 'east';
        this.map = EASTERN_MAP;
        this.player.owX = 6;
        this.player.owY = 14;
        this.showNotification('EASTERN EMBERWILD');
      }
      return;
    }
    if (tile === TILE.BRIDGE && x <= 2) {
      if (this.region === 'east') {
        this.region = 'west';
        this.map = WESTERN_MAP;
        this.player.owX = 17;
        this.player.owY = 14;
        this.showNotification('WESTERN EMBERWILD');
      }
      return;
    }
    const props = TILE_PROPS[tile];
    if (props.encounter > 0 && worldRng.next('overworld.encounterRoll') < props.encounter * 20) {
      this.entering = true;
      this.transitionTimer = 0;
      this.pendingEncounter = { tileType: tile };
    }
  }

  _findTown(x, y) {
    for (const [key, town] of Object.entries(TOWNS)) {
      if (town.region === this.region && town.mapX === x && town.mapY === y) return { key, ...town };
    }
    return null;
  }

  _findPalace(x, y) {
    for (const keep of PALACES) {
      if (keep.region === this.region && keep.mapX === x && keep.mapY === y) return keep;
    }
    return null;
  }

  _updateCamera() {
    const mapW = this.map[0].length * TILE_PX;
    const mapH = this.map.length * TILE_PX;
    this.camX = Math.max(0, Math.min(mapW - NES_W, this.player.owX * TILE_PX - NES_W / 2));
    this.camY = Math.max(0, Math.min(mapH - NES_H, this.player.owY * TILE_PX - NES_H / 2));
  }

  showNotification(text) {
    this.notification = text;
    this.notifTimer = 120;
    this.onNotification(text);
  }

  draw(ctx) {
    const gradient = ctx.createLinearGradient(0, 0, 0, NES_H * S);
    gradient.addColorStop(0, '#07132D');
    gradient.addColorStop(1, '#050817');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, NES_W * S, NES_H * S);
    const tileSize = TILE_PX * S;
    const startTX = Math.floor(this.camX / TILE_PX);
    const startTY = Math.floor(this.camY / TILE_PX);
    const endTX = Math.ceil((this.camX + NES_W) / TILE_PX);
    const endTY = Math.ceil((this.camY + NES_H) / TILE_PX);
    for (let ty = startTY; ty < endTY; ty++) {
      for (let tx = startTX; tx < endTX; tx++) {
        if (ty < 0 || ty >= this.map.length || tx < 0 || tx >= this.map[0].length) continue;
        const tile = this.map[ty][tx];
        const props = TILE_PROPS[tile] || TILE_PROPS[TILE.GRASS];
        const sx = (tx * TILE_PX - this.camX) * S;
        const sy = (ty * TILE_PX - this.camY) * S;
        const tint = {
          [TILE.GRASS]: '#123A3A', [TILE.FOREST]: '#0D463D', [TILE.MOUNTAIN]: '#2A3453',
          [TILE.WATER]: '#0A3159', [TILE.SWAMP]: '#173A35', [TILE.DESERT]: '#4A3C34',
          [TILE.ROAD]: '#2C3A52', [TILE.BRIDGE]: '#4C3E32', [TILE.TOWN]: '#3C3656',
          [TILE.PALACE]: '#351B55', [TILE.CAVE]: '#1C2744', [TILE.GRAVEYARD]: '#26233E',
          [TILE.LAVA]: '#4E2031',
        }[tile] || props.color;
        ctx.fillStyle = tint;
        ctx.fillRect(sx, sy, tileSize, tileSize);
        ctx.fillStyle = 'rgba(255,255,255,.035)';
        ctx.fillRect(sx, sy, tileSize, S);
        if ((tx * 7 + ty * 11) % 5 === 0) {
          ctx.fillStyle = tile === TILE.WATER ? '#267CB1' : '#25345A';
          ctx.fillRect(sx + 2 * S, sy + 4 * S, 3 * S, S);
        }
        if (tile === TILE.FOREST) drawTileSigil(ctx, tx * TILE_PX - this.camX, ty * TILE_PX - this.camY, 'forest', (tx + ty) % 2);
        if (tile === TILE.MOUNTAIN) drawTileSigil(ctx, tx * TILE_PX - this.camX, ty * TILE_PX - this.camY, 'mountain');
        if (tile === TILE.WATER) drawTileSigil(ctx, tx * TILE_PX - this.camX, ty * TILE_PX - this.camY, 'coast');
        if (tile === TILE.TOWN) drawTileSigil(ctx, tx * TILE_PX - this.camX, ty * TILE_PX - this.camY, 'town');
        if (tile === TILE.PALACE) drawTileSigil(ctx, tx * TILE_PX - this.camX, ty * TILE_PX - this.camY, 'night', 2);
      }
    }
    this._drawWorldDressing(ctx, tileSize, startTX, startTY, endTX, endTY);
    const px = (this.player.owX * TILE_PX - this.camX);
    const py = (this.player.owY * TILE_PX - this.camY);
    if (!this.entering || Math.floor(this.transitionTimer / 3) % 2 === 0) drawWorldAvatar(ctx, px, py, this.notifTimer > 0 ? 1 : 0);
    if (this.entering) {
      ctx.fillStyle = `rgba(66,245,230,${Math.min(0.5, this.transitionTimer / 30)})`;
      ctx.fillRect(0, 0, NES_W * S, NES_H * S);
    }
  }

  _drawWorldDressing(ctx, tileSize, startTX, startTY, endTX, endTY) {
    for (let ty = startTY; ty < endTY; ty++) {
      for (let tx = startTX; tx < endTX; tx++) {
        if (ty < 0 || ty >= this.map.length || tx < 0 || tx >= this.map[0].length) continue;
        const tile = this.map[ty][tx];
        const sx = (tx * TILE_PX - this.camX) * S;
        const sy = (ty * TILE_PX - this.camY) * S;
        const cx = sx + tileSize / 2;
        const cy = sy + tileSize / 2;
        ctx.save();
        ctx.globalAlpha = 0.62;
        if (tile === TILE.FOREST) {
          ctx.fillStyle = '#5CFF9B';
          ctx.beginPath();
          ctx.moveTo(cx, sy + 2 * S);
          ctx.lineTo(sx + 2 * S, sy + 7 * S);
          ctx.lineTo(sx + 6 * S, sy + 7 * S);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = '#102A2A';
          ctx.fillRect(cx - S, sy + 6 * S, 2 * S, 2 * S);
        } else if (tile === TILE.MOUNTAIN) {
          ctx.fillStyle = '#7E8DB8';
          ctx.beginPath();
          ctx.moveTo(sx + S, sy + 7 * S);
          ctx.lineTo(cx, sy + S);
          ctx.lineTo(sx + 7 * S, sy + 7 * S);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = '#2A3453';
          ctx.beginPath();
          ctx.moveTo(cx, sy + S);
          ctx.lineTo(cx + 2 * S, sy + 7 * S);
          ctx.lineTo(sx + 7 * S, sy + 7 * S);
          ctx.closePath();
          ctx.fill();
        } else if (tile === TILE.WATER) {
          ctx.strokeStyle = '#5BD7E0';
          ctx.lineWidth = S;
          ctx.beginPath();
          ctx.moveTo(sx + S, cy);
          ctx.quadraticCurveTo(cx, cy - S, sx + 7 * S, cy);
          ctx.stroke();
        } else if (tile === TILE.DESERT) {
          ctx.strokeStyle = '#FFE18A';
          ctx.lineWidth = S;
          ctx.beginPath();
          ctx.arc(cx - S, cy + S, 3 * S, Math.PI, Math.PI * 2);
          ctx.stroke();
        } else if (tile === TILE.SWAMP) {
          ctx.strokeStyle = '#42F5E6';
          ctx.lineWidth = S;
          for (let reed = 0; reed < 2; reed++) {
            ctx.beginPath();
            ctx.moveTo(sx + (2 + reed * 3) * S, sy + 7 * S);
            ctx.lineTo(sx + (3 + reed * 3) * S, sy + 3 * S);
            ctx.stroke();
          }
        } else if (tile === TILE.TOWN || tile === TILE.PALACE) {
          ctx.fillStyle = tile === TILE.TOWN ? '#FFE18A' : '#FF5CCB';
          ctx.fillRect(sx + 2 * S, sy + 3 * S, 4 * S, 4 * S);
          ctx.fillStyle = '#0B1224';
          ctx.fillRect(sx + 3 * S, sy + 5 * S, S, 2 * S);
        }
        ctx.restore();
      }
    }
  }

  get isEntering() { return this.entering && this.transitionTimer > 15; }

  resetEntry() {
    this.entering = false;
    this.transitionTimer = 0;
    const result = { encounter: this.pendingEncounter, town: this.pendingTown, palace: this.pendingPalace };
    this.pendingEncounter = null;
    this.pendingTown = null;
    this.pendingPalace = null;
    return result;
  }
}
