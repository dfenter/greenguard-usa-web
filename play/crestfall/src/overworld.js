// Overworld map renderer and navigation
// Top-down view of the Emberwild, 8 tiles visible at once in NES
// Each overworld tile = 8x8 NES pixels, player dot = 8x8

import { SCALE, TILE, TILE_PROPS, NES_W, NES_H } from './constants.js';
import { WESTERN_MAP, EASTERN_MAP, TOWNS, PALACES } from './map-data.js';
import { drawTextPx } from './sprites.js';
import { worldRng } from './rng.js';

const S = SCALE;
const TILE_PX = 8; // each tile is 8 NES pixels

export class Overworld {
  constructor(player) {
    this.player = player;
    this.map = WESTERN_MAP;      // current map region
    this.region = 'west';
    this.moveTimer = 0;
    this.moveCooldown = 12; // frames per tile move
    this.moveDx = 0;
    this.moveDy = 0;
    this.encounterTimer = 0;
    this.pendingEncounter = null;
    this.pendingTown = null;
    this.pendingPalace = null;
    this.transitionTimer = 0;
    this.entering = false;
    this.screenFlash = 0;
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

    // Handle movement
    if (this.moveTimer === 0) {
      let dx = 0, dy = 0;
      if (input.left)  dx = -1;
      if (input.right) dx =  1;
      if (input.up)    dy = -1;
      if (input.down)  dy =  1;

      if (dx !== 0 || dy !== 0) {
        const nx = this.player.owX + dx;
        const ny = this.player.owY + dy;

        if (ny >= 0 && ny < this.map.length && nx >= 0 && nx < this.map[0].length) {
          const tile = this.map[ny][nx];
          const props = TILE_PROPS[tile];

          if (props.passable) {
            this.player.owX = nx;
            this.player.owY = ny;
            this.moveTimer = this.moveCooldown;

            // Check special tile
            this._checkTile(tile, nx, ny);
          }
        }
      }
    }

    // Update camera to follow player
    this._updateCamera();
  }

  _checkTile(tile, x, y) {
    // Check for town/palace entry
    const town = this._findTown(x, y);
    if (town) {
      this.entering = true;
      this.transitionTimer = 0;
      this.pendingTown = town;
      return;
    }

    const palace = this._findPalace(x, y);
    if (palace) {
      this.entering = true;
      this.transitionTimer = 0;
      this.pendingPalace = palace;
      return;
    }

    // Check bridge crossing (east/west)
    if (tile === TILE.BRIDGE && x >= this.map[0].length - 3) {
      // Cross to the eastern Emberwild
      if (this.region === 'west') {
        this.region = 'east';
        this.map = EASTERN_MAP;
        // Connectivity fix (not a ledgered R-repair, but required for the
        // Phase 0.5 full-run-to-WIN gate to be achievable at all): (2,14)
        // is EASTERN_MAP's literal bridge tile, but it is landlocked —
        // every neighboring tile out to column 5 is WATER (see
        // EASTERN_MAP row 14), so a player landing there could never move
        // again. (6,14) is the nearest connected GRASS tile (verified by
        // flood-fill: 184 reachable tiles from there, including every
        // eastern town and palace except darunia, which sits on its own
        // pre-existing, separately unreachable MOUNTAIN tile — out of
        // scope here, not on the WIN path).
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

    // Random encounter
    const props = TILE_PROPS[tile];
    if (props.encounter > 0 && worldRng.next('overworld.encounterRoll') < props.encounter * 20) {
      this.entering = true;
      this.transitionTimer = 0;
      this.pendingEncounter = { tileType: tile };
    }
  }

  // R4 repair: lookup is region-qualified. Previously every town/palace was
  // searched by (x,y) alone across BOTH regions; nabooru/newkasuto shared
  // (14,6) and object insertion order made nabooru always win, permanently
  // hiding newkasuto (and THUNDER, and the Great Palace route) behind it.
  // Region qualification is necessary but was not by itself sufficient
  // here since both towns were also in the same region — see the R4 note
  // by TOWNS.nabooru in map-data.js for the paired coordinate fix.
  _findTown(x, y) {
    for (const [key, town] of Object.entries(TOWNS)) {
      if (town.region === this.region && town.mapX === x && town.mapY === y) return { key, ...town };
    }
    return null;
  }

  _findPalace(x, y) {
    for (const pal of PALACES) {
      if (pal.region === this.region && pal.mapX === x && pal.mapY === y) return pal;
    }
    return null;
  }

  _updateCamera() {
    const mapW = this.map[0].length * TILE_PX;
    const mapH = this.map.length * TILE_PX;
    const viewW = NES_W;
    const viewH = NES_H;

    this.camX = Math.max(0, Math.min(mapW - viewW, this.player.owX * TILE_PX - viewW/2));
    this.camY = Math.max(0, Math.min(mapH - viewH, this.player.owY * TILE_PX - viewH/2));
  }

  showNotification(text) {
    this.notification = text;
    this.notifTimer = 120;
  }

  draw(ctx) {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, NES_W * S, NES_H * S);

    const tileSize = TILE_PX * S;

    // Draw tiles
    const startTX = Math.floor(this.camX / TILE_PX);
    const startTY = Math.floor(this.camY / TILE_PX);
    const endTX   = Math.ceil((this.camX + NES_W) / TILE_PX);
    const endTY   = Math.ceil((this.camY + NES_H) / TILE_PX);

    for (let ty = startTY; ty < endTY; ty++) {
      for (let tx = startTX; tx < endTX; tx++) {
        if (ty < 0 || ty >= this.map.length || tx < 0 || tx >= this.map[0].length) continue;
        const tile = this.map[ty][tx];
        const props = TILE_PROPS[tile];
        const sx = (tx * TILE_PX - this.camX) * S;
        const sy = (ty * TILE_PX - this.camY) * S;

        ctx.fillStyle = props.color;
        ctx.fillRect(sx, sy, tileSize, tileSize);

        // Extra detail
        this._drawTileDetail(ctx, tile, sx, sy, tileSize, tx, ty);
      }
    }

    // Draw town/palace markers
    this._drawMarkers(ctx);

    // Draw the hero marker
    const px = (this.player.owX * TILE_PX - this.camX) * S;
    const py = (this.player.owY * TILE_PX - this.camY) * S;

    // Flash during entering transition
    if (!this.entering || Math.floor(this.transitionTimer / 4) % 2 === 0) {
      // Hero marker (simplified cloak and face)
      ctx.fillStyle = '#6844FC';
      ctx.fillRect(px, py, tileSize, tileSize);
      ctx.fillStyle = '#F0B078';
      ctx.fillRect(px + 2*S, py + 2*S, 4*S, 4*S);
    }

    // Notification text
    if (this.notifTimer > 0) {
      const alpha = Math.min(1, this.notifTimer / 30);
      ctx.globalAlpha = alpha;
      const textW = this.notification.length * 6 * S;
      const textX = (NES_W * S - textW) / 2;
      ctx.fillStyle = '#000000';
      ctx.fillRect(textX - 4, NES_H * S / 2 - 8 * S, textW + 8, 10 * S);
      drawTextPx(ctx, this.notification, textX, NES_H * S / 2 - 7 * S, '#F8D878', S);
      ctx.globalAlpha = 1;
    }

    // Screen flash on enter
    if (this.entering) {
      ctx.fillStyle = `rgba(255,255,255,${Math.min(1, this.transitionTimer / 20) * 0.8})`;
      ctx.fillRect(0, 0, NES_W * S, NES_H * S);
    }

    // Region indicator (drawn below HUD at y=60)
    drawTextPx(ctx, this.region === 'west' ? 'WESTERN EMBERWILD' : 'EASTERN EMBERWILD',
               4 * S, 60 * S, '#FCFCFC', S);
  }

  _drawTileDetail(ctx, tile, sx, sy, ts, tx, ty) {
    if (tile === TILE.FOREST) {
      // Tree dots
      ctx.fillStyle = '#004800';
      if ((tx + ty) % 2 === 0) {
        ctx.fillRect(sx + S, sy + S, 2*S, 2*S);
        ctx.fillRect(sx + 4*S, sy + 4*S, 2*S, 2*S);
      }
    } else if (tile === TILE.MOUNTAIN) {
      // Peak
      ctx.fillStyle = '#BCBCBC';
      ctx.fillRect(sx + 3*S, sy, 2*S, 2*S);
      ctx.fillStyle = '#FCFCFC';
      ctx.fillRect(sx + 3*S, sy, S, S);
    } else if (tile === TILE.SWAMP) {
      // Swamp murk
      ctx.fillStyle = '#002800';
      if ((tx * 3 + ty * 5) % 7 < 2) {
        ctx.fillRect(sx + 2*S, sy + 2*S, 3*S, 3*S);
      }
    } else if (tile === TILE.WATER) {
      // Wave lines
      ctx.fillStyle = '#3CBCFC';
      if ((tx + ty * 2) % 3 === 0) {
        ctx.fillRect(sx, sy + 3*S, ts, S);
      }
    } else if (tile === TILE.TOWN) {
      // House roof
      ctx.fillStyle = '#D81818';
      ctx.fillRect(sx + 2*S, sy, 4*S, 3*S);
      ctx.fillStyle = '#FCFCFC';
      ctx.fillRect(sx + 2*S, sy + 3*S, 4*S, 5*S);
    } else if (tile === TILE.PALACE) {
      // Palace walls
      ctx.fillStyle = '#9040C0';
      ctx.fillRect(sx, sy, ts, ts);
      ctx.fillStyle = '#C860F0';
      ctx.fillRect(sx + 2*S, sy, 4*S, 3*S);
      ctx.fillRect(sx + S, sy + 3*S, 6*S, 5*S);
    } else if (tile === TILE.ROAD) {
      // Road pebbles
      ctx.fillStyle = '#A88858';
      if ((tx * 7 + ty * 3) % 5 === 0) {
        ctx.fillRect(sx + 3*S, sy + 3*S, S, S);
      }
    } else if (tile === TILE.BRIDGE) {
      // Bridge planks
      ctx.fillStyle = '#A87838';
      ctx.fillRect(sx, sy + 2*S, ts, S);
      ctx.fillRect(sx, sy + 5*S, ts, S);
    } else if (tile === TILE.GRAVEYARD) {
      // Cross
      ctx.fillStyle = '#888888';
      ctx.fillRect(sx + 3*S, sy, 2*S, 6*S);
      ctx.fillRect(sx + S, sy + 2*S, 6*S, 2*S);
    }
  }

  _drawMarkers(ctx) {
    // Draw P1-P7 labels on palace tiles
    for (const pal of PALACES) {
      const px = (pal.mapX * TILE_PX - this.camX) * S;
      const py = (pal.mapY * TILE_PX - this.camY) * S;
      if (px >= -8*S && px < NES_W*S && py >= -8*S && py < NES_H*S) {
        const cleared = this.player.crystals > pal.id - 1;
        drawTextPx(ctx, `K${pal.id}`, px, py, cleared ? '#00A800' : '#F8D878', S);
      }
    }
  }

  get isEntering() { return this.entering && this.transitionTimer > 15; }

  resetEntry() {
    this.entering = false;
    this.transitionTimer = 0;
    const result = {
      encounter: this.pendingEncounter,
      town: this.pendingTown,
      palace: this.pendingPalace,
    };
    this.pendingEncounter = null;
    this.pendingTown = null;
    this.pendingPalace = null;
    return result;
  }
}
