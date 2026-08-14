// Side-scrolling engine for combat, palaces, and towns
// Handles rendering + collision for all non-overworld scenes

import { SCALE, NES_W, NES_H } from './constants.js';
import {
  drawPlayer, drawGuardian, drawProjectile, drawPickup, drawSigil,
  drawDoorGlyph, drawPixelPanel,
} from './sprites.js';
import { spawnEnemy } from './enemies.js';
import { buildFieldEncounter, buildPalaceRooms } from './map-data.js';
import { PALACES } from './map-data.js';
import { fxRng, worldRng } from './rng.js';

const S = SCALE;

// View area starts below the compact HUD and coach strip.
const VIEW_Y = 48;
const VIEW_H = NES_H - VIEW_Y;

const KEEP_BIBLE = {
  1: { name: 'VERDANT KEEP', short: 'FOREST', bg: '#071E28', floor: '#123B34', glow: '#5CFF9B', guardian: 'RAVENHORSE' },
  2: { name: 'MIRE KEEP', short: 'MARSH', bg: '#10152B', floor: '#24324B', glow: '#42F5E6', guardian: 'CROWNBACK' },
  3: { name: 'TIDELINE KEEP', short: 'COAST', bg: '#061A32', floor: '#174A62', glow: '#4D8DFF', guardian: 'IRONWRAITH' },
  4: { name: 'STONEFRACTURE', short: 'MOUNTAIN', bg: '#1C142A', floor: '#3B3152', glow: '#FF9A52', guardian: 'STONEVEX' },
  5: { name: 'TRIUNE VAULT', short: 'RUINS', bg: '#161126', floor: '#302452', glow: '#9B6CFF', guardian: 'IRONROOT' },
  6: { name: 'DEEPWATER KEEP', short: 'COAST', bg: '#06162A', floor: '#0E4861', glow: '#42F5E6', guardian: 'TIDEBANE' },
  7: { name: 'NIGHT CITADEL', short: 'NIGHT', bg: '#090817', floor: '#291747', glow: '#FF5CCB', guardian: 'UMBRAKIN' },
};

const ENEMY_DISPLAY_NAMES = {
  duskwing: 'NIGHTMOTH',
  boneward: 'BONEWARD',
  hexweaver: 'HEXWEAVER',
  ironwraith: 'IRONWRAITH',
  ravenhorse: 'RAVENHORSE',
  crownback: 'CROWNBACK',
  umbrakin: 'UMBRAKIN',
  crescent: 'CRESCENT HUNTER',
  brineclaw: 'BRINECLAW',
  stonevex: 'STONEVEX',
  ironroot: 'IRONROOT',
  tidebane: 'TIDEBANE',
  bit: 'FLICKERLING',
};

export class SideView {
  constructor(player, options = {}) {
    this.player = player;
    this.onEvent = options.onEvent || (() => {});
    this.onMessage = options.onMessage || (() => {});
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
    this.roomEntrySide = 'left';
    this.isTraining = false;
    this.trainingFlags = { move: false, jump: false, attack: false };
    this.levelUpPending = false;
    this.levelUpAttr = 'atk';
    this.keepTheme = KEEP_BIBLE[1];
    this.roomTheme = this.keepTheme;
    this.frame = 0;
    this.particleLimit = 128;
    this.damageFlash = 0;
    this.reflectedProjectiles = [];
  }

  loadFieldEncounter(tileType, difficulty = 1) {
    this.isPalace = false;
    this.isFinalPalace = false;
    this.isTraining = false;
    // buildFieldEncounter is pure (decision 2 / Rev 2): the rng stream is
    // an explicit parameter here, not read from a hidden module global.
    this.rooms = [buildFieldEncounter(tileType, difficulty, worldRng)];
    this.keepTheme = { name: 'FIELD POCKET', short: 'FIELD', bg: '#071A25', floor: '#15422F', glow: '#42F5E6', guardian: '' };
    this.rooms[0].items = [
      { type: 'heart', x: 56, y: 132 },
      { type: 'magic', x: 104, y: 132 },
      { type: 'fragment', x: 184, y: 132 },
    ];
    this.roomIndex = 0;
    this._loadRoom(0, 'left', false);
  }

  loadTraining() {
    this.isPalace = false;
    this.isFinalPalace = false;
    this.isTraining = true;
    this.keepTheme = { name: 'TRAINING POCKET', short: 'TRAIN', bg: '#08192A', floor: '#16405A', glow: '#42F5E6', guardian: '' };
    this.rooms = [{
      id: 'training', type: 'training', w: 256, h: 167, bgColor: '#08192A', keepTheme: this.keepTheme,
      platforms: [
        { x: 0, y: 148, w: 256, h: 20 },
        { x: 56, y: 120, w: 36, h: 8 },
        { x: 116, y: 96, w: 40, h: 8 },
        { x: 182, y: 120, w: 42, h: 8 },
      ],
      doors: [], enemies: [], items: [], next: -1,
    }];
    this.roomIndex = 0;
    this.trainingFlags = { move: false, jump: false, attack: false };
    this._loadRoom(0, 'left', false);
  }

  loadPalace(palaceId) {
    this.isPalace = true;
    this.isTraining = false;
    this.palaceId = palaceId;
    // The final keep is flagged so its guardian
    // death → WIN transition (game.js) knows this palace clear is the win
    // condition rather than an ordinary keep-clear return trip.
    this.isFinalPalace = !!PALACES.find(p => p.id === palaceId)?.isFinal;
    this.keepTheme = KEEP_BIBLE[palaceId] || KEEP_BIBLE[1];
    this.rooms = buildPalaceRooms(palaceId);
    this._authorKeep(palaceId);
    this.roomIndex = 0;
    this._loadRoom(0, 'left', false);
  }

  _authorKeep(palaceId) {
    const theme = this.keepTheme;
    this.rooms.forEach((room, index) => {
      room.keepTheme = theme;
      room.bgColor = index === 3 ? '#160B24' : theme.bg;
      room.items = [...(room.items || [])];
      if (index < 3) {
        room.items.push({ type: 'heart', x: 42 + index * 62, y: 132 });
        room.items.push({ type: 'magic', x: 96 + index * 46, y: 132 });
        room.items.push({ type: 'fragment', x: 206 - index * 38, y: 132 });
      }
      if (index === 1) {
        room.doors = [...(room.doors || [])];
        room.doors.unshift({ x: 0, y: 112, w: 16, h: 32, locked: false, leadsTo: 4, secret: true });
      }
    });
    this.rooms.push({
      id: 4,
      type: 'secret',
      w: 256,
      h: 167,
      bgColor: '#0B1027',
      keepTheme: theme,
      platforms: [
        { x: 0, y: 148, w: 256, h: 20 },
        { x: 38, y: 112, w: 44, h: 8 },
        { x: 110, y: 88, w: 54, h: 8 },
        { x: 188, y: 112, w: 44, h: 8 },
      ],
      doors: [{ x: 0, y: 112, w: 16, h: 32, locked: false, leadsTo: 1, secret: true }],
      enemies: [],
      items: [
        { type: 'heart', x: 48, y: 96 },
        { type: 'magic', x: 122, y: 72 },
        { type: 'fragment', x: 202, y: 96 },
        { type: 'pbag', x: 128, y: 48, large: true },
      ],
      next: 1,
    });
  }

  _loadRoom(idx, entrySide = 'left', animate = true) {
    this.room = this.rooms[idx];
    this.roomIndex = idx;
    this.roomTheme = this.room.keepTheme || this.keepTheme;
    this.roomEntrySide = entrySide;
    this.transitioning = animate;
    this.transitionTimer = 0;

    // Place player at entrance
    this.player.x = entrySide === 'right'
      ? Math.max(24, this.room.w - this.player.w - 24)
      : 24;
    this.player.y = this.room.platforms[0]?.y - this.player.h || 140;
    this.player.vx = 0;
    this.player.vy = 0;
    this.player.onGround = false;
    this.player.state = 'stand';
    this.player.attackTimer = 0;
    this.player.attackPhase = 'ready';
    this.player.attackElapsed = 0;
    this.player.swordActive = false;
    this.player.fireballs = [];
    this.player.arcBolts = [];
    this.player.thunderPulse = false;
    this.player.swordBeam = null;

    // Spawn enemies
    this.enemies = (this.room.enemies || []).map((e, index) => {
      const spawnKey = this.isPalace ? `p${this.palaceId}:r${this.roomIndex}:e${index}` : '';
      if (spawnKey && this.player.defeatedEnemies[spawnKey]) return null;
      const enemy = spawnEnemy(e.type, e.x, e.y, { difficulty: this.palaceId, variant: e.variant, color: e.color });
      enemy.isBoss = !!e.isBoss;
      enemy._spawnKey = spawnKey;
      if (this.isPalace && !enemy.isBoss) {
        const scale = 1 + Math.max(0, this.palaceId - 1) * 0.08;
        enemy.maxHp = Math.ceil(enemy.maxHp * scale);
        enemy.hp = enemy.maxHp;
        enemy.damageAmount += Math.floor(Math.max(0, this.palaceId - 2) / 3);
      }
      return enemy;
    }).filter(Boolean);

    // Spawn items
    this.items = (this.room.items || []).map((it, index) => {
      const rewardKey = this.isPalace ? `p${this.palaceId}:r${this.roomIndex}:i${index}` : '';
      return { ...it, rewardKey, collected: !!rewardKey && !!this.player.claimedRewards[rewardKey] };
    });

    this.particles = [];
    this.deathEffects = [];
    this.reflectedProjectiles = [];
    this.camX = 0;
  }

  update(input) {
    if (!this.room) return null;
    this.frame++;
    if (this.damageFlash > 0) this.damageFlash--;
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
    if (this.isTraining) {
      if (Math.abs(this.player.vx) > 0) this.trainingFlags.move = true;
      if (this.player.state === 'jump' || this.player.vy < -1) this.trainingFlags.jump = true;
      if (this.player.attackPulse) this.trainingFlags.attack = true;
    }
    if (input.pressA && (this.player.state === 'jump' || this.player.vy < -1)) this.onEvent('jump', {});
    if (this.player.attackPulse) this.onEvent('sword', { phase: this.player.attackPhase });
    if (this.player.lastRuneEvent) this.onEvent('rune', this.player.lastRuneEvent);

    // Update enemies
    for (const e of this.enemies) {
      if (!e.alive) continue;
      e.update(this.player, this.room.platforms, scene);
      this._updateTelegraph(e);

      // Enemy attacks player
      this._checkEnemyAttack(e);
    }

    if (this.player.thunderPulse) {
      this._triggerThunder();
      this.player.thunderPulse = false;
    }
    this._checkReflectedProjectiles();

    // Check player sword hitting enemies
    this._checkPlayerAttacks();

    // Check projectile hits
    this._checkProjectileHits();

    // Check item pickups
    this._checkItems();

    // Remove dead enemies with death effect
    for (const e of this.enemies) {
      if (!e.alive && !e._deathProcessed) {
        e._deathProcessed = true;
        if (e._spawnKey) this.player.defeatedEnemies[e._spawnKey] = true;
        this._spawnDeathEffect(e.x + e.w/2, e.y + e.h/2);
        // XP gain
        const xpGain = e.xpReward || 10;
        this.player.gainXP(xpGain);
        this.player.score += xpGain;
        this.onEvent('kill', { boss: !!e.isBoss, type: e.type });

        // Check level up
        if (this.player._pendingLevelUp && this.player._pendingLevelUp.length > 0) {
          this.levelUpPending = true;
          this.levelUpAttr = 'atk';
        }
      }
    }

    // Remove dead enemies (death effects already spawned above)
    this.enemies = this.enemies.filter(e => e.alive);

    // Resolve combat rewards before a door can reload the room or leave it.
    if (this.player.state === 'dead') return { playerDied: true };
    const doorResult = this._checkDoors();
    if (doorResult) return doorResult;

    // Update particles
    this._updateParticles();

    // Camera follow player
    this._updateCamera();

    return null;
  }

  _updateTelegraph(enemy) {
    if (!enemy.isBoss) {
      enemy.telegraph = 0;
      return;
    }
    if (enemy.mace && enemy.mace.timer > 0) enemy.telegraph = 0;
    else if (enemy.attackTimer > 0) enemy.telegraph = Math.min(18, enemy.attackTimer);
    else if (enemy.fireTimer != null && enemy.fireTimer < 18) enemy.telegraph = enemy.fireTimer;
    else if (enemy.requestedType && enemy.type === 'boneward') enemy.telegraph = this.frame % 120 < 18 ? 18 - (this.frame % 18) : 0;
    else enemy.telegraph = 0;
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
      this._damagePlayer(enemy.damageAmount, this._attackHeight(enemy.getHitbox ? enemy.getHitbox() : enemy), enemy.x, enemy.y);
    }

    // Projectile attacks (hexweaver beams, brineclaw fireballs, etc.)
    const projs = enemy.projectiles || enemy.fireballs || [];
    for (const p of projs) {
      if (this._rectOverlaps(p, this.player)) {
        if (p.type === 'magic' && this.player.activeSpells.REFLECT) {
          this.reflectedProjectiles.push({
            ...p,
            x: p.x,
            y: p.y,
            vx: -p.vx || this.player.facing * 2,
            vy: -p.vy,
            damage: this.player.atkPower + 2,
            reflected: true,
          });
          p.x = -999;
          this._spawnParryFx(this.player.x + this.player.w / 2, this.player.y + 6);
          this.onEvent('parry', { x: p.x, y: p.y });
          continue;
        }
        this._damagePlayer(p.damage || 2, this._attackHeight(p), p.x, p.y);
        p.x = -999; // mark for removal
      }
    }

    // Returning crescent projectile
    if (enemy.boomerang && this._rectOverlaps(enemy.boomerang, this.player)) {
      this._damagePlayer(enemy.boomerang.damage || 2, this._attackHeight(enemy.boomerang), enemy.boomerang.x, enemy.boomerang.y);
    }

    // Boss-specific attacks
    if (enemy.mace && this._rectOverlaps(enemy.mace, this.player)) {
      this._damagePlayer(enemy.mace.damage, this._attackHeight(enemy.mace), enemy.mace.x, enemy.mace.y);
    }
    if (enemy.swordBox && this._rectOverlaps(enemy.swordBox, this.player)) {
      this._damagePlayer(enemy.damageAmount, this._attackHeight(enemy.swordBox), enemy.swordBox.x, enemy.swordBox.y);
    }
  }

  _damagePlayer(amount, attackType, x, y) {
    const damaged = this.player.takeDamage(amount, attackType);
    if (this.player.lastHitResult === 'parry') {
      this._spawnParryFx(this.player.x + this.player.w / 2, this.player.y + 6);
      this.onEvent('parry', { x, y });
    } else if (damaged) {
      this.damageFlash = 12;
      this._spawnDamageFx(this.player.x + this.player.w / 2, this.player.y + 6);
      this.onEvent('damage', { x, y });
    }
    return damaged;
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
          this._applyKnockback(e, attackType);
          this._spawnHitSpark(e.x + e.w/2, e.y + e.h/2);
          this.onEvent('hit', { boss: !!e.isBoss });
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
          const hit = e.takeDamage(p.atkPower + 2, 'mid');
          if (hit) this._applyKnockback(e, 'mid');
          fb.x = -999;
          this._spawnHitSpark(e.x, e.y);
        }
      }
    }
    p.fireballs = p.fireballs.filter(f => f.x > -100);

    // HEX rune bolts
    for (const bolt of p.arcBolts) {
      for (const e of this.enemies) {
        if (!e.alive || !this._rectOverlaps(bolt, e)) continue;
        const hit = e.takeDamage(bolt.damage, 'mid');
        if (hit) {
          this._applyKnockback(e, 'mid');
          this._spawnHitSpark(e.x, e.y);
          this.onEvent('hit', { boss: !!e.isBoss, spell: true });
        }
        bolt.x = -999;
        break;
      }
    }
    p.arcBolts = p.arcBolts.filter(bolt => bolt.x > -100);

    // Player sword beam
    if (p.swordBeam) {
      for (const e of this.enemies) {
        if (!e.alive) continue;
        if (this._rectOverlaps(p.swordBeam, e)) {
          const hit = e.takeDamage(p.atkPower, 'mid');
          if (hit) this._applyKnockback(e, 'mid');
          p.swordBeam = null;
          this._spawnHitSpark(e.x, e.y);
          break;
        }
      }
    }
  }

  _checkReflectedProjectiles() {
    this.reflectedProjectiles = this.reflectedProjectiles.filter((projectile) => {
      projectile.x += projectile.vx;
      projectile.y += projectile.vy;
      for (const enemy of this.enemies) {
        if (!enemy.alive || !this._rectOverlaps(projectile, enemy)) continue;
        const hit = enemy.takeDamage(projectile.damage, 'mid');
        if (hit) {
          this._applyKnockback(enemy, 'mid');
          this._spawnHitSpark(enemy.x, enemy.y);
          this.onEvent('hit', { boss: !!enemy.isBoss, spell: true });
        }
        return false;
      }
      return projectile.x > -16 && projectile.x < this.room.w + 16 && projectile.y > -16 && projectile.y < this.room.h + 16;
    });
  }

  _triggerThunder() {
    const p = this.player;
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      const dx = enemy.x + enemy.w / 2 - (p.x + p.w / 2);
      const dy = enemy.y + enemy.h / 2 - (p.y + p.h / 2);
      if (Math.hypot(dx, dy) > 76) continue;
      const hit = enemy.takeDamage(p.atkPower + 5, 'high');
      if (hit) {
        this._applyKnockback(enemy, 'up');
        this._spawnHitSpark(enemy.x + enemy.w / 2, enemy.y + enemy.h / 2);
        this.onEvent('hit', { boss: !!enemy.isBoss, spell: true });
      }
    }
    for (let i = 0; i < 12; i++) {
      this._pushParticle({
        x: p.x + p.w / 2 + (fxRng.next('sideview.thunder.x') - 0.5) * 120,
        y: p.y + p.h / 2 + (fxRng.next('sideview.thunder.y') - 0.5) * 50,
        life: 24, maxLife: 24, type: 'bolt', color: '#FFE18A',
      });
    }
    this.onEvent('thunder', {});
  }

  _applyKnockback(enemy, attackType) {
    const direction = this.player.x < enemy.x ? 1 : -1;
    const weight = enemy.isBoss ? 0.45 : Math.max(0.55, Math.min(1.4, 12 / Math.max(8, enemy.w + enemy.hp)));
    enemy.x += direction * 4 * weight;
    if (attackType === 'up' || attackType === 'down') enemy.vy = -1.2 * weight;
    enemy.x = Math.max(0, Math.min(this.room.w - enemy.w, enemy.x));
  }

  _checkItems() {
    for (const item of this.items) {
      if (item.collected) continue;
      const ir = { x: item.x, y: item.y, w: 8, h: 8 };
      if (this._rectOverlaps(ir, this.player)) {
        item.collected = true;
        if (item.rewardKey) this.player.claimedRewards[item.rewardKey] = true;
        if (item.type === 'key') {
          this.player.keys++;
          this.showMessage('KEY +1');
          this.onEvent('pickup', { type: 'key' });
        } else if (item.type === 'crystal') {
          this.player.crystals++;
          this.showMessage(`SIGIL ${this.player.crystals}/7`);
          this.onEvent('sigil', { count: this.player.crystals });
        } else if (item.type === 'pbag') {
          const xp = item.large ? 100 : 50;
          this.player.gainXP(xp);
          this.onEvent('pickup', { type: 'xp' });
        } else if (item.type === 'heart') {
          this.player.hp = Math.min(this.player.maxHp, this.player.hp + 16);
          this.onEvent('pickup', { type: 'heart' });
        } else if (item.type === 'magic') {
          this.player.mp = Math.min(this.player.maxMp, this.player.mp + 8);
          this.onEvent('pickup', { type: 'magic' });
        } else if (item.type === 'fragment') {
          this.player.sigilFragments = (this.player.sigilFragments || 0) + 1;
          this.player.score += 25;
          this.onEvent('fragment', { count: this.player.sigilFragments });
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
            const entrySide = door.x < this.room.w / 2 ? 'right' : 'left';
            this._loadRoom(door.leadsTo, entrySide);
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
    // now reachable, both field-encounter exits were unwinnable. Repaired to
    // the clamp's own bounds so both exits are reachable.
    //
    // Scoped to field encounters (this.isPalace === false) deliberately:
    // palace rooms already progress via doors, and the final boss room
    // (doors:[], next:-1, same as a field encounter) must NOT be
    // edge-walkable — it has to exit only through the palace-clear /
    // final-boss-death flow in game.js. Applying the same reachable-edge
    // fix to palace rooms would let a player walk past an unbeaten boss,
    // which is a new bug, not a repair the ledger asks for.
    if (!this.isPalace && !this.isTraining) {
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
    this.onMessage(text, this.roomTheme?.glow);
  }

  _spawnHitSpark(x, y) {
    for (let i = 0; i < 4; i++) {
      this._pushParticle({
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
    this.deathEffects.push({ x: x - this.camX, y, timer: 0, maxTimer: 42 });
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      this._pushParticle({
        x: x - this.camX, y,
        vx: Math.cos(angle) * 2,
        vy: Math.sin(angle) * 2,
        life: 30, maxLife: 30,
        type: 'spark',
        color: i % 2 === 0 ? '#D81818' : '#F8D878',
      });
    }
    for (let i = 0; i < 5; i++) {
      this._pushParticle({
        x: x - this.camX + (fxRng.next('sideview.death.smokeX') - 0.5) * 10,
        y: y + (fxRng.next('sideview.death.smokeY') - 0.5) * 8,
        vx: (fxRng.next('sideview.death.smokeVx') - 0.5) * 0.6,
        vy: -0.5 - fxRng.next('sideview.death.smokeVy') * 0.8,
        life: 42, maxLife: 42, type: 'smoke', color: '#9AA7C6',
      });
    }
  }

  _spawnParryFx(x, y) {
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      this._pushParticle({
        x: x - this.camX, y, vx: Math.cos(angle) * 1.7, vy: Math.sin(angle) * 1.7,
        life: 22, maxLife: 22, type: 'rune', color: '#42F5E6',
      });
    }
  }

  _spawnDamageFx(x, y) {
    this._pushParticle({ x: x - this.camX, y, life: 20, maxLife: 20, type: 'ring', color: '#FF557A' });
    for (let i = 0; i < 4; i++) {
      this._pushParticle({
        x: x - this.camX, y,
        vx: (fxRng.next('sideview.damage.fireVx') - 0.5) * 2,
        vy: -1 - fxRng.next('sideview.damage.fireVy'),
        life: 18, maxLife: 18, type: 'fire', color: '#FF9A52',
      });
    }
  }

  _pushParticle(particle) {
    if (this.particles.length >= this.particleLimit) this.particles.shift();
    this.particles.push(particle);
  }

  _updateParticles() {
    this.particles = this.particles.filter(p => {
      p.life--;
      if (p.type === 'spark') {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.1;
      } else if (p.type === 'rune') {
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.92;
        p.vy *= 0.92;
      } else if (p.type === 'text') {
        p.y += p.vy;
      } else if (p.type === 'fire' || p.type === 'smoke') {
        p.x += p.vx || 0;
        p.y += p.vy || 0;
        p.vy = (p.vy || 0) + (p.type === 'smoke' ? -0.01 : 0.05);
      }
      return p.life > 0;
    });
    for (const effect of this.deathEffects) effect.timer++;
    this.deathEffects = this.deathEffects.filter(effect => effect.timer < effect.maxTimer);
  }

  draw(ctx) {
    const theme = this.roomTheme || this.keepTheme;
    const gradient = ctx.createLinearGradient(0, VIEW_Y * S, 0, NES_H * S);
    gradient.addColorStop(0, theme.bg);
    gradient.addColorStop(1, '#050817');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, VIEW_Y * S, NES_W * S, VIEW_H * S);
    if (!this.room) return;
    const ox = -this.camX;
    this._drawEnvironment(ctx, theme, ox);
    ctx.fillStyle = 'rgba(66,245,230,.035)';
    for (let y = VIEW_Y; y < NES_H; y += 8) ctx.fillRect(0, y * S, NES_W * S, S);
    for (const platform of this.room.platforms) this._drawPlatform(ctx, platform, ox);
    for (const door of this.room.doors || []) {
      const sx = door.x + ox;
      if (sx > -16 && sx < NES_W + 16) drawDoorGlyph(ctx, sx, VIEW_Y + door.y, door.locked);
    }
    for (const item of this.items) {
      if (!item.collected && item.x + ox > -16 && item.x + ox < NES_W + 16) this._drawItem(ctx, item, item.x + ox, VIEW_Y + item.y);
    }
    for (const enemy of this.enemies) {
      if (enemy.alive && enemy.x + ox > -32 && enemy.x + ox < NES_W + 32) this._drawEnemy(ctx, enemy, enemy.x + ox, VIEW_Y + enemy.y);
    }
    drawPlayer(ctx, Math.round(this.player.x + ox), VIEW_Y + Math.round(this.player.y), this.player.walkFrame, this.player.facing, this.player.getSpriteState(), this.player.attackPhase);
    if (this.player.swordBeam) drawProjectile(ctx, Math.round(this.player.swordBeam.x + ox), VIEW_Y + Math.round(this.player.swordBeam.y), 'beam');
    for (const fireball of this.player.fireballs) drawProjectile(ctx, Math.round(fireball.x + ox), VIEW_Y + Math.round(fireball.y), 'ember');
    for (const bolt of this.player.arcBolts) drawProjectile(ctx, Math.round(bolt.x + ox), VIEW_Y + Math.round(bolt.y), 'arc');
    for (const projectile of this.reflectedProjectiles) drawProjectile(ctx, Math.round(projectile.x + ox), VIEW_Y + Math.round(projectile.y), 'arc');
    for (const particle of this.particles) {
      const alpha = Math.max(0, particle.life / (particle.maxLife || particle.life));
      ctx.save();
      ctx.globalAlpha = alpha;
      if (particle.type === 'ring') {
        ctx.strokeStyle = particle.color;
        ctx.lineWidth = 2 * S;
        ctx.beginPath();
        ctx.arc(Math.round(particle.x) * S, (VIEW_Y + Math.round(particle.y)) * S, (20 - particle.life * 0.4) * S, 0, Math.PI * 2);
        ctx.stroke();
      } else if (particle.type === 'bolt') {
        ctx.strokeStyle = particle.color;
        ctx.lineWidth = 2 * S;
        ctx.beginPath();
        ctx.moveTo((particle.x - 3) * S, (VIEW_Y + particle.y - 8) * S);
        ctx.lineTo((particle.x + 1) * S, (VIEW_Y + particle.y - 2) * S);
        ctx.lineTo((particle.x - 2) * S, (VIEW_Y + particle.y + 5) * S);
        ctx.stroke();
      } else {
        ctx.fillStyle = particle.color;
        const size = particle.type === 'smoke' ? 5 : particle.type === 'fire' ? 2 : particle.type === 'rune' ? 2 : 3;
        ctx.fillRect(Math.round(particle.x) * S, (VIEW_Y + Math.round(particle.y)) * S, size * S, size * S);
      }
      ctx.restore();
    }
    for (const effect of this.deathEffects) {
      const progress = effect.timer / effect.maxTimer;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - progress);
      ctx.strokeStyle = progress < 0.25 ? '#FCFCFC' : '#FF557A';
      ctx.lineWidth = 2 * S;
      ctx.beginPath();
      ctx.arc((effect.x + ox) * S, (VIEW_Y + effect.y) * S, (4 + progress * 18) * S, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    if (this.damageFlash > 0) {
      const edge = ctx.createRadialGradient(NES_W * S / 2, (VIEW_Y + VIEW_H / 2) * S, 30 * S, NES_W * S / 2, (VIEW_Y + VIEW_H / 2) * S, 190 * S);
      edge.addColorStop(0, 'rgba(255,30,80,0)');
      edge.addColorStop(1, `rgba(255,30,80,${this.damageFlash / 30})`);
      ctx.fillStyle = edge;
      ctx.fillRect(0, VIEW_Y * S, NES_W * S, VIEW_H * S);
    }
  }

  _drawEnvironment(ctx, theme, ox) {
    const palette = {
      FOREST: ['#0B2B33', '#0E4B40', '#1B6B52'],
      MARSH: ['#171D3B', '#27335B', '#466174'],
      COAST: ['#0A2C4A', '#145679', '#2B8AAA'],
      MOUNTAIN: ['#241A3A', '#493A65', '#8A5E67'],
      RUINS: ['#211A3A', '#4B3471', '#7E5FB5'],
      NIGHT: ['#120F2B', '#2B1C50', '#6D397E'],
      TRAIN: ['#0B2A42', '#16516A', '#3C98A2'],
      FIELD: ['#0A2A32', '#125242', '#2B8660'],
    }[theme.short] || ['#0B1830', '#20395B', '#476F85'];
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = palette[0];
    ctx.beginPath();
    ctx.moveTo(0, (VIEW_Y + 148) * S);
    for (let x = 0; x <= this.room.w; x += 24) {
      const crest = 12 + ((x / 24 + this.palaceId) % 3) * 8;
      ctx.lineTo((x + ox) * S, (VIEW_Y + 104 - crest) * S);
    }
    ctx.lineTo((this.room.w + ox) * S, (VIEW_Y + 148) * S);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = palette[1];
    for (let x = 8; x < this.room.w; x += 28) {
      const h = 12 + ((x * 3 + this.palaceId * 7) % 22);
      ctx.fillRect((x + ox) * S, (VIEW_Y + 136 - h) * S, 4 * S, h * S);
      ctx.fillRect((x - 4 + ox) * S, (VIEW_Y + 128 - h) * S, 12 * S, 4 * S);
    }
    ctx.fillStyle = palette[2];
    for (let x = 0; x < this.room.w; x += 16) {
      const y = 136 + ((x * 5 + this.frame) % 9);
      ctx.fillRect((x + ox) * S, (VIEW_Y + y) * S, 8 * S, S);
    }
    if (theme.short === 'COAST') {
      ctx.strokeStyle = '#5BD7E0';
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = S;
      for (let y = 90; y < 140; y += 14) {
        ctx.beginPath();
        ctx.moveTo(0, (VIEW_Y + y) * S);
        ctx.quadraticCurveTo(64 * S, (VIEW_Y + y - 4) * S, 128 * S, (VIEW_Y + y) * S);
        ctx.quadraticCurveTo(192 * S, (VIEW_Y + y + 4) * S, 256 * S, (VIEW_Y + y) * S);
        ctx.stroke();
      }
    }
    if (theme.short === 'MOUNTAIN' || theme.short === 'RUINS') {
      ctx.fillStyle = 'rgba(255,225,138,.15)';
      for (let x = 24; x < this.room.w; x += 46) {
        ctx.fillRect((x + ox) * S, (VIEW_Y + 78) * S, 3 * S, 38 * S);
        ctx.fillRect((x - 7 + ox) * S, (VIEW_Y + 88) * S, 17 * S, 2 * S);
      }
    }
    ctx.restore();
  }

  _drawPlatform(ctx, p, ox) {
    const sx = p.x + ox;
    const sy = VIEW_Y + p.y;
    if (sx + p.w < 0 || sx > NES_W) return;
    const theme = this.roomTheme || this.keepTheme;
    ctx.fillStyle = theme.floor;
    ctx.fillRect(sx * S, sy * S, p.w * S, p.h * S);
    ctx.fillStyle = theme.glow;
    ctx.fillRect(sx * S, sy * S, p.w * S, Math.min(2, p.h) * S);
    ctx.fillStyle = 'rgba(7,10,24,.55)';
    ctx.fillRect(sx * S, (sy + p.h - 2) * S, p.w * S, Math.min(2, p.h) * S);
    if (p.h > 8) {
      ctx.fillStyle = 'rgba(255,255,255,.08)';
      for (let x = sx + 6; x < sx + p.w; x += 12) ctx.fillRect(x * S, (sy + 5) * S, S, (p.h - 8) * S);
    }
  }

  _drawItem(ctx, item, ix, iy) {
    if (item.type === 'crystal') drawSigil(ctx, ix, iy, item.crystalIdx || this.palaceId, 2);
    else if (item.type === 'heart') drawPickup(ctx, ix, iy, 'heart', this.frame % 3);
    else if (item.type === 'fragment') drawPickup(ctx, ix, iy, 'fragment', this.frame % 3);
    else if (item.type === 'magic' || item.type === 'key') drawPickup(ctx, ix, iy, 'rune', this.frame % 3);
    else if (item.type === 'pbag') drawPickup(ctx, ix, iy, 'fragment', item.large ? 3 : 1);
  }

  _drawEnemy(ctx, e, ex, ey) {
    const fr = e.walkFrame || 0;
    if (e.visible === false) return;
    drawGuardian(ctx, e.requestedType || e.type, ex, ey, fr, e.phase || 0, e.telegraph || 0, !!e.blocking);
    for (const projectile of (e.projectiles || e.fireballs || [])) {
      drawProjectile(ctx, Math.round(projectile.x - this.camX), VIEW_Y + Math.round(projectile.y), projectile.type === 'magic' ? 'arc' : 'ember');
    }
    if (e.boomerang) drawProjectile(ctx, Math.round(e.boomerang.x - this.camX), VIEW_Y + Math.round(e.boomerang.y), 'beam');
    if (e.isBoss) {
      const bx = 74;
      const by = VIEW_Y + 18;
      drawPixelPanel(ctx, bx, by, 108, 12, '#0B1224', this.roomTheme.glow, 0.9);
      ctx.fillStyle = '#FF557A';
      ctx.fillRect((bx + 4) * S, (by + 5) * S, Math.max(0, Math.floor(100 * e.hp / e.maxHp)) * S, 3 * S);
    }
    if (e.iframes > 0 && Math.floor(e.iframes / 3) % 2 === 1) {
      ctx.fillStyle = 'rgba(243,251,255,.6)';
      ctx.fillRect(ex * S, ey * S, e.w * S, e.h * S);
    }
  }
}
