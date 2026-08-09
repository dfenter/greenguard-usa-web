// Side-scrolling engine for combat, palaces, and towns
// Handles rendering + collision for all non-overworld scenes

import { SCALE, NES_W, NES_H } from './constants.js';
import {
  drawLink, drawStalfos, drawWizzrobe, drawIronknuckle,
  drawAche, drawFireball, drawMagicBeam, drawSwordBeam,
  drawPalaceBlock, drawFieldBlock, drawTextPx, drawCrystal,
  drawKey, drawPBag, drawDoor, drawNPC,
} from './sprites.js';
import { spawnEnemy } from './enemies.js';
import { buildFieldEncounter, buildPalaceRooms } from './map-data.js';
import { PALACES } from './map-data.js';
import { fxRng, worldRng } from './rng.js';

const S = SCALE;

// View area starts at y=57 (after HUD)
const VIEW_Y = 57;
const VIEW_H = NES_H - VIEW_Y;

const ENEMY_DISPLAY_NAMES = {
  ache: 'NIGHTMOTH',
  stalfos: 'BONEWARD',
  wizzrobe: 'HEXWEAVER',
  ironknuckle: 'IRONWRAITH',
  horsehead: 'RAVENHORSE',
  helmethead: 'CROWNBACK',
  darklink: 'UMBRAKIN',
  goriya: 'CRESCENT HUNTER',
  lizalfos: 'BRINECLAW',
  carock: 'STONEVEX',
  gooma: 'IRONROOT',
  barba: 'TIDEBANE',
  bit: 'FLICKERLING',
};

export class SideView {
  constructor(player) {
    this.player = player;
    this.room = null;
    this.enemies = [];
    this.items = [];
    this.roomIndex = 0;
    this.rooms = [];
    this.isPalace = false;
    this.palaceId = 0;
    this.camX = 0;
    this.particles = [];
    this.deathEffects = [];
    this.message = '';
    this.messageTimer = 0;
    this.transitionTimer = 0;
    this.transitioning = false;
    this.transitionDir = 1; // 1=right, -1=left
    this.levelUpPending = false;
    this.levelUpAttr = 'atk';
  }

  loadFieldEncounter(tileType, difficulty = 1) {
    this.isPalace = false;
    this.isFinalPalace = false;
    // buildFieldEncounter is pure (decision 2 / Rev 2): the rng stream is
    // an explicit parameter here, not read from a hidden module global.
    this.rooms = [buildFieldEncounter(tileType, difficulty, worldRng)];
    this.roomIndex = 0;
    this._loadRoom(0);
  }

  loadPalace(palaceId) {
    this.isPalace = true;
    this.palaceId = palaceId;
    // The final keep is flagged so its guardian
    // death → WIN transition (game.js) knows this palace clear is the win
    // condition rather than an ordinary keep-clear return trip.
    this.isFinalPalace = !!PALACES.find(p => p.id === palaceId)?.isFinal;
    this.rooms = buildPalaceRooms(palaceId);
    this.roomIndex = 0;
    this._loadRoom(0);
  }

  _loadRoom(idx) {
    this.room = this.rooms[idx];
    this.roomIndex = idx;

    // Place player at entrance
    this.player.x = 8;
    this.player.y = this.room.platforms[0]?.y - this.player.h || 140;
    this.player.vx = 0;
    this.player.vy = 0;
    this.player.onGround = false;
    this.player.state = 'stand';
    this.player.attackTimer = 0;
    this.player.swordActive = false;
    this.player.fireballs = [];
    this.player.swordBeam = null;

    // Spawn enemies
    this.enemies = this.room.enemies.map(e => {
      const enemy = spawnEnemy(e.type, e.x, e.y);
      enemy.isBoss = !!e.isBoss;
      return enemy;
    });

    // Spawn items
    this.items = this.room.items.map(it => ({ ...it, collected: false }));

    this.particles = [];
    this.deathEffects = [];
    this.camX = 0;
  }

  update(input) {
    if (!this.room) return null;
    if (this.transitioning) {
      this.transitionTimer++;
      if (this.transitionTimer > 30) {
        this.transitioning = false;
        this.transitionTimer = 0;
      }
      return;
    }

    if (this.messageTimer > 0) {
      this.messageTimer--;
      if (input.pressB || input.pressA) this.messageTimer = 0;
      return;
    }

    const scene = { w: this.room.w, h: this.room.h };

    // Update player
    this.player.update(input, this.room.platforms, this.enemies, scene);

    // Update enemies
    for (const e of this.enemies) {
      if (!e.alive) continue;
      e.update(this.player, this.room.platforms, scene);

      // Enemy attacks player
      this._checkEnemyAttack(e);
    }

    // Check player sword hitting enemies
    this._checkPlayerAttacks();

    // Check projectile hits
    this._checkProjectileHits();

    // Check item pickups
    this._checkItems();

    // Check door triggers
    const doorResult = this._checkDoors();
    if (doorResult) return doorResult;

    // Remove dead enemies with death effect
    for (const e of this.enemies) {
      if (!e.alive && !e._deathProcessed) {
        e._deathProcessed = true;
        this._spawnDeathEffect(e.x + e.w/2, e.y + e.h/2);
        // XP gain
        const xpGain = e.xpReward || 10;
        this.player.gainXP(xpGain);
        this.player.score += xpGain;
        this._showXPGain(e.x, e.y, xpGain);

        // Check level up
        if (this.player._pendingLevelUp && this.player._pendingLevelUp.length > 0) {
          this.levelUpPending = true;
          this.levelUpAttr = 'atk';
        }
      }
    }

    // Remove dead enemies (death effects already spawned above)
    this.enemies = this.enemies.filter(e => e.alive);

    // Update particles
    this._updateParticles();

    // Camera follow player
    this._updateCamera();

    // Check if player died
    if (this.player.state === 'dead') {
      return { playerDied: true };
    }

    return null;
  }

  // R5: classify an attack hitbox as 'high' or 'low' relative to the
  // player's vertical midpoint, so Player.takeDamage can check it against
  // the player's shieldStance ('high' while standing, 'low' while
  // crouching).
  _attackHeight(box) {
    const boxMid = box.y + (box.h || 0) / 2;
    const playerMid = this.player.y + this.player.h / 2;
    return boxMid < playerMid ? 'high' : 'low';
  }

  _checkEnemyAttack(enemy) {
    // Body contact damage
    if (enemy.overlaps(this.player)) {
      this.player.takeDamage(enemy.damageAmount, this._attackHeight(enemy.getHitbox ? enemy.getHitbox() : enemy));
    }

    // Projectile attacks (wizzrobe beams, lizalfos fireballs, etc.)
    const projs = enemy.projectiles || enemy.fireballs || [];
    for (const p of projs) {
      if (this._rectOverlaps(p, this.player)) {
        this.player.takeDamage(p.damage || 2, this._attackHeight(p));
        p.x = -999; // mark for removal
      }
    }

    // Goriya boomerang
    if (enemy.boomerang && this._rectOverlaps(enemy.boomerang, this.player)) {
      this.player.takeDamage(enemy.boomerang.damage || 2, this._attackHeight(enemy.boomerang));
    }

    // Boss-specific attacks
    if (enemy.mace && this._rectOverlaps(enemy.mace, this.player)) {
      this.player.takeDamage(enemy.mace.damage, this._attackHeight(enemy.mace));
    }
    if (enemy.swordBox && this._rectOverlaps(enemy.swordBox, this.player)) {
      this.player.takeDamage(enemy.damageAmount, this._attackHeight(enemy.swordBox));
    }
  }

  _checkPlayerAttacks() {
    const p = this.player;
    if (!p.swordActive || !p.swordBox) return;

    // Determine attack type for enemy blocking logic
    let attackType = 'mid';
    if (p.state === 'attackup') attackType = 'up';
    if (p.state === 'attackdown') attackType = 'down';
    if (p.state === 'crouch') attackType = 'low';

    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (e.isHitBy(p.swordBox, attackType)) {
        const hit = e.takeDamage(p.atkPower, attackType);
        if (hit) {
          this._spawnHitSpark(e.x + e.w/2, e.y + e.h/2);
        }
      }
    }
  }

  _checkProjectileHits() {
    const p = this.player;

    // Player fireballs
    for (const fb of p.fireballs) {
      for (const e of this.enemies) {
        if (!e.alive) continue;
        if (this._rectOverlaps(fb, e)) {
          e.takeDamage(p.atkPower + 2, 'mid');
          fb.x = -999;
          this._spawnHitSpark(e.x, e.y);
        }
      }
    }
    p.fireballs = p.fireballs.filter(f => f.x > -100);

    // Player sword beam
    if (p.swordBeam) {
      for (const e of this.enemies) {
        if (!e.alive) continue;
        if (this._rectOverlaps(p.swordBeam, e)) {
          e.takeDamage(p.atkPower, 'mid');
          p.swordBeam = null;
          this._spawnHitSpark(e.x, e.y);
          break;
        }
      }
    }
  }

  _checkItems() {
    for (const item of this.items) {
      if (item.collected) continue;
      const ir = { x: item.x, y: item.y, w: 8, h: 8 };
      if (this._rectOverlaps(ir, this.player)) {
        item.collected = true;
        if (item.type === 'key') {
          this.player.keys++;
          this.showMessage('FOUND A RUNE!');
        } else if (item.type === 'crystal') {
          this.player.crystals++;
          this.showMessage(`SIGIL ${this.player.crystals} FOUND!`);
        } else if (item.type === 'pbag') {
          const xp = item.large ? 100 : 50;
          this.player.gainXP(xp);
          this.showMessage(`+${xp} XP!`);
        } else if (item.type === 'heart') {
          this.player.hp = Math.min(this.player.maxHp, this.player.hp + 16);
        } else if (item.type === 'magic') {
          this.player.mp = Math.min(this.player.maxMp, this.player.mp + 8);
        }
      }
    }
  }

  _checkDoors() {
    for (const door of (this.room.doors || [])) {
      const dr = { x: door.x, y: door.y, w: door.w, h: door.h };
      if (this._rectOverlaps(dr, this.player)) {
        if (door.locked) {
          if (this.player.keys > 0) {
            this.player.keys--;
            door.locked = false;
            this.showMessage('GATE UNLOCKED!');
          } else {
            // Push player back
            this.player.x = door.x - this.player.w - 2;
            this.showMessage('THE GATE IS SEALED.');
          }
        } else {
          // Transition to next room
          if (door.leadsTo !== undefined && door.leadsTo >= 0 && door.leadsTo < this.rooms.length) {
            this._loadRoom(door.leadsTo);
            return null;
          } else if (door.leadsTo === -1 || this.room.next === -1) {
            return { exitPalace: true };
          }
        }
      }
    }

    // Auto advance past left/right edge — FIELD ENCOUNTERS ONLY.
    // R2 repair (reviews/sol_port_spec_review_2026-07-18.md "field
    // encounters unwinnable exits"): player.x is clamped to
    // 0..(scene.w - player.w) in player.js, so the max/min reachable x is
    // room.w-player.w / 0. The original thresholds (`room.w - 4` and
    // `x < -8`) were outside that clamp's range and could never be
    // reached — both field-encounter exits were unwinnable. Repaired to
    // the clamp's own bounds so both exits are reachable.
    //
    // Scoped to field encounters (this.isPalace === false) deliberately:
    // palace rooms already progress via doors, and the final boss room
    // (doors:[], next:-1, same as a field encounter) must NOT be
    // edge-walkable — it has to exit only through the palace-clear /
    // final-boss-death flow in game.js. Applying the same reachable-edge
    // fix to palace rooms would let a player walk past an unbeaten boss,
    // which is a new bug, not a repair the ledger asks for.
    if (!this.isPalace) {
      if (this.player.x >= this.room.w - this.player.w) {
        const next = this.room.next;
        if (next >= 0 && next < this.rooms.length) {
          this._loadRoom(next);
        } else if (next === -1) {
          return { exitScene: true };
        }
      }

      if (this.player.x <= 0) {
        return { exitScene: true };
      }
    }
  }

  _updateCamera() {
    const targetX = this.player.x - NES_W / 2;
    this.camX = Math.max(0, Math.min(this.room.w - NES_W, targetX));
  }

  _rectOverlaps(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x &&
           a.y < b.y + b.h && a.y + a.h > b.y;
  }

  showMessage(text) {
    this.message = text;
    this.messageTimer = 120;
  }

  _showXPGain(x, y, xp) {
    this.particles.push({
      x: x - this.camX, y: y,
      text: `+${xp}XP`,
      vy: -0.5, life: 60, type: 'text',
      color: '#F8D878',
    });
  }

  _spawnHitSpark(x, y) {
    for (let i = 0; i < 4; i++) {
      this.particles.push({
        x: x - this.camX, y,
        vx: (fxRng.next('sideview.hitSpark.vx')-0.5)*3,
        vy: (fxRng.next('sideview.hitSpark.vy')-0.5)*3,
        life: 15, maxLife: 15,
        type: 'spark',
        color: '#F8D878',
      });
    }
  }

  _spawnDeathEffect(x, y) {
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      this.particles.push({
        x: x - this.camX, y,
        vx: Math.cos(angle) * 2,
        vy: Math.sin(angle) * 2,
        life: 30, maxLife: 30,
        type: 'spark',
        color: i % 2 === 0 ? '#D81818' : '#F8D878',
      });
    }
  }

  _updateParticles() {
    this.particles = this.particles.filter(p => {
      p.life--;
      if (p.type === 'spark') {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.1;
      } else if (p.type === 'text') {
        p.y += p.vy;
      }
      return p.life > 0;
    });
  }

  draw(ctx) {
    // Background
    ctx.fillStyle = this.room?.bgColor || '#000000';
    ctx.fillRect(0, VIEW_Y * S, NES_W * S, VIEW_H * S);

    if (!this.room) return;

    const ox = -this.camX; // world offset in NES px

    // Draw platforms
    for (const p of this.room.platforms) {
      this._drawPlatform(ctx, p, ox);
    }

    // Draw doors
    for (const door of (this.room.doors || [])) {
      const sx = door.x + ox;
      const sy = door.y;
      if (sx > -16 && sx < NES_W + 16) {
        ctx.fillStyle = door.locked ? '#884400' : '#C88840';
        ctx.fillRect(sx * S, (VIEW_Y + sy) * S, door.w * S, door.h * S);
        if (door.locked) {
          ctx.fillStyle = '#F8D878';
          ctx.fillRect((sx+6)*S, (VIEW_Y+sy+10)*S, 4*S, 6*S);
        }
      }
    }

    // Draw items
    for (const item of this.items) {
      if (item.collected) continue;
      const ix = item.x + ox;
      const iy = VIEW_Y + item.y;
      if (ix > -16 && ix < NES_W + 16) {
        this._drawItem(ctx, item, ix, iy);
      }
    }

    // Draw enemies
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const ex = e.x + ox;
      const ey = VIEW_Y + e.y;
      if (ex > -32 && ex < NES_W + 32) {
        this._drawEnemy(ctx, e, ex, ey);
      }
    }

    // Draw player
    const px = Math.round(this.player.x + ox);
    const py = VIEW_Y + Math.round(this.player.y);
    const sprState = this.player.getSpriteState();
    drawLink(ctx, px, py, this.player.walkFrame, this.player.facing, sprState);

    // Draw sword beam
    if (this.player.swordBeam) {
      const b = this.player.swordBeam;
      drawSwordBeam(ctx, Math.round(b.x + ox), VIEW_Y + Math.round(b.y));
    }

    // Draw player fireballs
    for (const fb of this.player.fireballs) {
      drawFireball(ctx, Math.round(fb.x + ox), VIEW_Y + Math.round(fb.y));
    }

    // Draw particles
    for (const p of this.particles) {
      if (p.type === 'spark') {
        const a = p.life / p.maxLife;
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.round(p.x) * S, (VIEW_Y + Math.round(p.y)) * S, 2*S, 2*S);
        ctx.globalAlpha = 1;
      } else if (p.type === 'text') {
        drawTextPx(ctx, p.text, Math.round(p.x) * S, (VIEW_Y + Math.round(p.y)) * S, p.color, S);
      }
    }

    // Message box
    if (this.messageTimer > 0) {
      const mw = Math.max(this.message.length * 6, 80);
      const mx = (NES_W - mw) / 2;
      ctx.fillStyle = '#000080';
      ctx.fillRect(mx * S, (VIEW_Y + 60) * S, mw * S, 16 * S);
      ctx.strokeStyle = '#FCFCFC';
      ctx.lineWidth = S;
      ctx.strokeRect(mx * S, (VIEW_Y + 60) * S, mw * S, 16 * S);
      drawTextPx(ctx, this.message, (mx + 4) * S, (VIEW_Y + 64) * S, '#FCFCFC', S);
    }

    // Transition flash
    if (this.transitioning) {
      const a = this.transitionTimer < 15 ? this.transitionTimer / 15 : 1 - (this.transitionTimer - 15) / 15;
      ctx.fillStyle = `rgba(255,255,255,${Math.max(0,Math.min(1,a))})`;
      ctx.fillRect(0, VIEW_Y * S, NES_W * S, VIEW_H * S);
    }
  }

  _drawPlatform(ctx, p, ox) {
    const sx = p.x + ox;
    const sy = VIEW_Y + p.y;
    if (sx + p.w < 0 || sx > NES_W) return;

    if (this.isPalace) {
      // Palace blocks
      ctx.fillStyle = '#6844FC';
      ctx.fillRect(sx * S, sy * S, p.w * S, p.h * S);
      ctx.fillStyle = '#A888FC';
      ctx.fillRect(sx * S, sy * S, p.w * S, S);
      ctx.fillRect(sx * S, sy * S, S, p.h * S);
      ctx.fillStyle = '#2800A8';
      ctx.fillRect(sx * S, (sy + p.h - 1) * S, p.w * S, S);
      ctx.fillRect((sx + p.w - 1) * S, sy * S, S, p.h * S);
    } else {
      // Field blocks (grass top, dirt body)
      ctx.fillStyle = '#00A800';
      ctx.fillRect(sx * S, sy * S, p.w * S, Math.min(4, p.h) * S);
      if (p.h > 4) {
        ctx.fillStyle = '#884000';
        ctx.fillRect(sx * S, (sy + 4) * S, p.w * S, (p.h - 4) * S);
      }
    }
  }

  _drawItem(ctx, item, ix, iy) {
    if (item.type === 'key') {
      drawKey(ctx, ix, iy);
    } else if (item.type === 'crystal') {
      drawCrystal(ctx, ix, iy, item.crystalIdx || 0);
    } else if (item.type === 'pbag') {
      drawPBag(ctx, ix, iy, item.large);
    } else if (item.type === 'heart') {
      ctx.fillStyle = '#D81818';
      ctx.fillRect(ix * S, iy * S, 8 * S, 8 * S);
    } else if (item.type === 'magic') {
      ctx.fillStyle = '#0058F8';
      ctx.fillRect(ix * S, iy * S, 8 * S, 8 * S);
    }
  }

  _drawEnemy(ctx, e, ex, ey) {
    const fr = e.walkFrame || 0;
    switch (e.type) {
      case 'ache':
        drawAche(ctx, ex, ey, fr);
        break;
      case 'stalfos':
        drawStalfos(ctx, ex, ey, fr);
        break;
      case 'wizzrobe':
        if (e.visible !== false) {
          drawWizzrobe(ctx, ex, ey, fr);
          // Draw wizzrobe projectiles
          for (const proj of (e.projectiles || [])) {
            drawMagicBeam(ctx, Math.round(proj.x - this.camX), VIEW_Y + Math.round(proj.y));
          }
        }
        break;
      case 'ironknuckle':
      case 'horsehead':
      case 'helmethead':
      case 'darklink':
        drawIronknuckle(ctx, ex, ey, fr);
        // Scale up bosses slightly
        if (e.isBoss) {
          ctx.fillStyle = 'rgba(200,0,0,0.15)';
          ctx.fillRect((ex - 4) * S, (ey - 4) * S, (e.w + 8) * S, (e.h + 8) * S);
        }
        // Draw projectiles
        for (const proj of (e.projectiles || e.fireballs || [])) {
          drawFireball(ctx, Math.round(proj.x - this.camX), VIEW_Y + Math.round(proj.y));
        }
        // Boss HP bar
        if (e.isBoss) {
          const bw = 100;
          const bx = (NES_W - bw) / 2;
          const by = VIEW_Y + 2;
          ctx.fillStyle = '#800000';
          ctx.fillRect(bx * S, by * S, bw * S, 4 * S);
          ctx.fillStyle = '#D81818';
          ctx.fillRect(bx * S, by * S, Math.floor((e.hp / e.maxHp) * bw) * S, 4 * S);
          drawTextPx(ctx, ENEMY_DISPLAY_NAMES[e.requestedType || e.type] || 'VOIDBEAST', bx * S, (by - 8) * S, '#F8D878', S);
        }
        break;
      case 'goriya':
        drawIronknuckle(ctx, ex, ey, fr); // reuse sprite
        ctx.fillStyle = '#008800';
        ctx.fillRect(ex * S, ey * S, e.w * S, e.h * S * 0.2);
        // Boomerang
        if (e.boomerang) {
          const b = e.boomerang;
          ctx.fillStyle = '#F8D878';
          ctx.fillRect(Math.round(b.x - this.camX) * S, (VIEW_Y + Math.round(b.y)) * S, 6*S, 3*S);
        }
        break;
      case 'lizalfos':
        drawIronknuckle(ctx, ex, ey, fr); // placeholder
        ctx.fillStyle = '#004800';
        ctx.fillRect(ex * S, ey * S, e.w * S, 4 * S);
        for (const fb of (e.fireballs || [])) {
          drawFireball(ctx, Math.round(fb.x - this.camX), VIEW_Y + Math.round(fb.y));
        }
        break;
      default:
        ctx.fillStyle = '#D81818';
        ctx.fillRect(ex * S, ey * S, e.w * S, e.h * S);
    }

    // Hit flash
    if (e.iframes > 0 && Math.floor(e.iframes / 3) % 2 === 1) {
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(ex * S, ey * S, e.w * S, e.h * S);
    }
  }
}
