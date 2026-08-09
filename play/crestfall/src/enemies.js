// Enemy definitions and AI
import { GRAVITY, MAX_FALL, ENEMY_XP } from './constants.js';
import { combatRng } from './rng.js';

// Monotonic per-instance id (trace mode / harness): lets scenario checkpoints
// and RNG trace logs identify exactly which enemy consumed which draw,
// independent of array position (enemies are filtered/removed in-place).
let _enemyIdSeq = 0;
export function resetEnemyIdSeq() { _enemyIdSeq = 0; }

// Base enemy class
class Enemy {
  constructor(x, y, w, h, hp, xpReward) {
    this.id = ++_enemyIdSeq;
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.vx = 0;
    this.vy = 0;
    this.hp = hp;
    this.maxHp = hp;
    this.xpReward = xpReward;
    this.facing = -1; // default face left (toward player)
    this.onGround = false;
    this.alive = true;
    this.iframes = 0;
    this.state = 'patrol';
    this.timer = 0;
    this.type = 'enemy';
    this.drops = []; // items to drop on death
    this.blocking = false; // for shield-bearing enemies
    this.hitHigh = false; // this attack hits high
    this.hitLow = false;  // this attack hits low
    this.damageAmount = 1;
  }

  update(player, platforms, scene) {
    if (!this.alive) return;
    if (this.iframes > 0) this.iframes--;
    this.timer++;
    this._aiUpdate(player, platforms, scene);
    this._physics(platforms);
    // Face the player
    this.facing = player.x < this.x ? -1 : 1;
  }

  _aiUpdate(player, platforms, scene) {
    // Override in subclasses
  }

  _physics(platforms) {
    // Gravity
    if (!this.onGround) {
      this.vy += GRAVITY;
      if (this.vy > MAX_FALL) this.vy = MAX_FALL;
    }
    this.x += this.vx;
    this.y += this.vy;
    this.onGround = false;
    for (const p of platforms) {
      if (this.x + this.w > p.x && this.x < p.x + p.w &&
          this.y + this.h > p.y && this.y + this.h - this.vy <= p.y) {
        this.y = p.y - this.h;
        this.vy = 0;
        this.onGround = true;
      }
    }
  }

  takeDamage(amount, attackType = 'mid') {
    if (this.iframes > 0) return false;
    // Blocking logic for shield enemies
    if (this.blocking) {
      // Blocks same-height attacks from front
      const fromRight = this.facing === 1; // enemy faces right
      // If player attacks from correct direction and height, block
      if (attackType === 'mid') return false; // blocked!
    }
    this.hp -= amount;
    this.iframes = 30;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
    }
    return true; // hit landed
  }

  getHitbox() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }

  // Check if player's sword hits this enemy
  isHitBy(swordBox, attackType) {
    if (!swordBox) return false;
    const eb = this.getHitbox();
    return swordBox.x < eb.x + eb.w && swordBox.x + swordBox.w > eb.x &&
           swordBox.y < eb.y + eb.h && swordBox.y + swordBox.h > eb.y;
  }

  // Check if enemy body overlaps player (for damage)
  overlaps(player) {
    return this.x < player.x + player.w && this.x + this.w > player.x &&
           this.y < player.y + player.h && this.y + this.h > player.y;
  }
}

// ---- ACHE (bat) ----
export class Ache extends Enemy {
  constructor(x, y) {
    super(x, y, 8, 6, 2, ENEMY_XP.ache);
    this.type = 'ache';
    this.ampX = 30 + combatRng.next(`ache#${this.id}.ampX`) * 20;
    this.ampY = 15 + combatRng.next(`ache#${this.id}.ampY`) * 10;
    this.startX = x;
    this.startY = y;
    this.phase = combatRng.next(`ache#${this.id}.phase`) * Math.PI * 2;
    this.speed = 0.04 + combatRng.next(`ache#${this.id}.speed`) * 0.02;
    this.chaseMode = false;
    this.damageAmount = 1;
  }

  _aiUpdate(player, platforms, scene) {
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const dist = Math.sqrt(dx*dx + dy*dy);

    if (dist < 80) {
      // Chase player
      this.chaseMode = true;
    }
    if (this.chaseMode) {
      const spd = 1.5;
      this.vx = (dx / dist) * spd;
      this.vy = (dy / dist) * spd;
    } else {
      // Figure-8 patrol
      this.phase += this.speed;
      this.vx = Math.cos(this.phase) * 1.2;
      this.vy = Math.sin(this.phase * 2) * 0.8;
    }
  }

  _physics(platforms) {
    // Bats fly - no gravity
    this.x += this.vx;
    this.y += this.vy;
  }

  takeDamage(amount) {
    if (this.iframes > 0) return false;
    this.hp -= amount;
    this.iframes = 15;
    if (this.hp <= 0) { this.hp = 0; this.alive = false; }
    return true;
  }
}

// ---- BONEWARD (skeleton warrior) ----
export class Stalfos extends Enemy {
  constructor(x, y, variant = 'normal') {
    super(x, y, 12, 16, variant === 'hard' ? 4 : 2, ENEMY_XP.stalfos);
    this.type = 'stalfos';
    this.variant = variant;
    this.walkSpeed = 0.8;
    this.jumpCooldown = 0;
    this.attackCooldown = 0;
    this.blocking = false;
    this.blockTimer = 0;
    this.damageAmount = 2;
    this.walkFrame = 0;
    this.walkTimer = 0;
  }

  _aiUpdate(player, platforms, scene) {
    const dx = player.x - this.x;
    const dist = Math.abs(dx);

    this.attackCooldown = Math.max(0, this.attackCooldown - 1);
    this.jumpCooldown   = Math.max(0, this.jumpCooldown - 1);
    this.blockTimer     = Math.max(0, this.blockTimer - 1);

    // Decide to block
    if (this.blockTimer <= 0 && dist < 60) {
      if (combatRng.next(`stalfos#${this.id}.blockDecision`) < 0.01) {
        this.blocking = true;
        this.blockTimer = 40 + Math.floor(combatRng.next(`stalfos#${this.id}.blockDuration`) * 40);
      }
    } else if (this.blockTimer <= 0) {
      this.blocking = false;
    }

    if (this.blocking) {
      this.vx = 0;
      return;
    }

    // Move toward player
    if (dist > 16) {
      this.vx = (dx > 0 ? 1 : -1) * this.walkSpeed;
    } else {
      this.vx = 0;
    }

    // Jump over pits or to reach player
    if (this.onGround && this.jumpCooldown <= 0 && dist < 80) {
      if (combatRng.next(`stalfos#${this.id}.jumpDecision`) < 0.015) {
        this.vy = -4;
        this.onGround = false;
        this.jumpCooldown = 90;
      }
    }

    // Walk animation
    this.walkTimer++;
    if (this.walkTimer >= 8) { this.walkTimer = 0; this.walkFrame ^= 1; }
  }

  takeDamage(amount, attackType = 'mid') {
    if (this.iframes > 0) return false;
    // Stalfos blocks mid attacks if blocking
    if (this.blocking && attackType === 'mid') return false;
    // Hard variant also blocks low
    if (this.variant === 'hard' && this.blocking && attackType === 'low') return false;
    this.hp -= amount;
    this.iframes = 20;
    this.blocking = false;
    this.blockTimer = 0;
    if (this.hp <= 0) { this.hp = 0; this.alive = false; }
    return true;
  }
}

// ---- HEXWEAVER ----
export class Wizzrobe extends Enemy {
  constructor(x, y) {
    super(x, y, 10, 16, 3, ENEMY_XP.wizzrobe);
    this.type = 'wizzrobe';
    this.visible = true;
    this.teleportCooldown = 120;
    this.shootCooldown = 60;
    this.projectiles = [];
    this.damageAmount = 2;
    this.floatAmp = 4;
    this.floatPhase = 0;
    this.baseY = y;
  }

  _aiUpdate(player, platforms, scene) {
    this.teleportCooldown = Math.max(0, this.teleportCooldown - 1);
    this.shootCooldown    = Math.max(0, this.shootCooldown - 1);
    this.floatPhase += 0.05;

    // Float
    this.y = this.baseY + Math.sin(this.floatPhase) * this.floatAmp;

    // Teleport
    if (this.teleportCooldown <= 0) {
      this.visible = false;
      // Teleport to random position near scene center
      this.x = 30 + combatRng.next(`wizzrobe#${this.id}.teleportX`) * (scene.w - 60);
      this.baseY = 80 + combatRng.next(`wizzrobe#${this.id}.teleportY`) * 60;
      this.y = this.baseY;
      this.visible = true;
      this.teleportCooldown = 120 + Math.floor(combatRng.next(`wizzrobe#${this.id}.teleportCooldown`) * 60);
    }

    // Shoot magic beam
    if (this.shootCooldown <= 0 && this.visible) {
      const dx = player.x - this.x;
      const dy = player.y - this.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      const spd = 2;
      this.projectiles.push({
        x: this.x + (this.facing === 1 ? this.w : -8),
        y: this.y + 8,
        vx: (dx/dist) * spd,
        vy: (dy/dist) * spd,
        w: 8, h: 8,
        type: 'magic',
        damage: 2,
      });
      this.shootCooldown = 90;
    }

    // Update projectiles
    this.projectiles = this.projectiles.filter(p => {
      p.x += p.vx;
      p.y += p.vy;
      return p.x > -16 && p.x < scene.w + 16 && p.y > -16 && p.y < scene.h + 16;
    });
  }

  _physics(platforms) {
    // Wizzrobe floats - no normal physics
    this.x += this.vx;
  }

  takeDamage(amount, attackType = 'mid') {
    if (this.iframes > 0) return false;
    // MIRROR rune would affect some arcane foes; greybox attacks stay hittable.
    this.hp -= amount;
    this.iframes = 20;
    if (this.hp <= 0) { this.hp = 0; this.alive = false; }
    return true;
  }
}

// ---- IRONWRAITH ----
export class Ironknuckle extends Enemy {
  constructor(x, y, color = 'gray') {
    super(x, y, 14, 16, 6, ENEMY_XP.ironknuckle);
    this.type = 'ironknuckle';
    this.color = color;
    this.walkSpeed = 0.6;
    this.attackCooldown = 0;
    this.attacking = false;
    this.attackTimer = 0;
    this.blocking = false;
    this.blockClearTimer = 0;
    this.blockChance = color === 'orange' ? 0.02 : 0.015;
    this.damageAmount = 4;
    this.walkFrame = 0;
    this.walkTimer = 0;
    this.projectiles = []; // orange IK throws sword
  }

  _aiUpdate(player, platforms, scene) {
    this.attackCooldown = Math.max(0, this.attackCooldown - 1);
    if (this.attackTimer > 0) {
      this.attackTimer--;
      if (this.attackTimer === 0) this.attacking = false;
    }

    const dx = player.x - this.x;
    const dist = Math.abs(dx);

    // Block decision
    // Sim-step frame timer (Rev 2 decision 1) replacing the wall-clock
    // setTimeout that used to clear `blocking`. 1500ms @ 60Hz = 90 frames.
    if (this.blockClearTimer > 0) {
      this.blockClearTimer--;
      if (this.blockClearTimer === 0) this.blocking = false;
    }
    if (combatRng.next(`ironknuckle#${this.id}.blockDecision`) < this.blockChance) {
      this.blocking = true;
      this.blockClearTimer = 90;
    }

    if (this.attacking) {
      this.vx = 0;
      return;
    }

    // Attack if in range
    if (dist < 20 && this.attackCooldown <= 0) {
      this.attacking = true;
      this.attackTimer = 20;
      this.attackCooldown = 60;
      this.vx = 0;
      // Orange throws sword
      if (this.color === 'orange' && combatRng.next(`ironknuckle#${this.id}.throwDecision`) < 0.3) {
        this.projectiles.push({
          x: this.x + (this.facing === 1 ? this.w : -12),
          y: this.y + 4,
          vx: this.facing * 2.5,
          vy: 0,
          w: 12, h: 4,
          damage: 4,
        });
      }
      return;
    }

    // Walk toward player
    if (dist > 12) {
      this.vx = (dx > 0 ? 1 : -1) * this.walkSpeed;
    } else {
      this.vx = 0;
    }

    this.walkTimer++;
    if (this.walkTimer >= 10) { this.walkTimer = 0; this.walkFrame ^= 1; }

    // Update projectiles
    this.projectiles = this.projectiles.filter(p => {
      p.x += p.vx;
      return p.x > -16 && p.x < scene.w + 16;
    });
  }

  takeDamage(amount, attackType = 'mid') {
    if (this.iframes > 0) return false;
    if (this.blocking) return false; // Full block
    this.hp -= amount;
    this.iframes = 20;
    if (this.hp <= 0) { this.hp = 0; this.alive = false; }
    return true;
  }
}

// ---- BRINECLAW ----
export class Lizalfos extends Enemy {
  constructor(x, y) {
    super(x, y, 12, 16, 4, ENEMY_XP.lizalfos);
    this.type = 'lizalfos';
    this.walkSpeed = 1.2;
    this.jumpCooldown = 0;
    this.damageAmount = 3;
    this.walkFrame = 0;
    this.walkTimer = 0;
    this.fireballs = [];
    this.fireCooldown = 120;
  }

  _aiUpdate(player, platforms, scene) {
    const dx = player.x - this.x;
    const dist = Math.abs(dx);

    this.jumpCooldown = Math.max(0, this.jumpCooldown - 1);
    this.fireCooldown = Math.max(0, this.fireCooldown - 1);

    // Shoot fire
    if (this.fireCooldown <= 0 && dist < 100) {
      this.fireballs.push({
        x: this.x + (this.facing === 1 ? this.w : -8),
        y: this.y + 8,
        vx: this.facing * 2,
        vy: 0,
        w: 8, h: 8,
        damage: 3,
      });
      this.fireCooldown = 90;
    }

    // Move
    if (dist > 60) {
      this.vx = (dx > 0 ? 1 : -1) * this.walkSpeed;
    } else {
      this.vx = 0;
    }

    // Leap at player
    if (this.onGround && this.jumpCooldown <= 0 && dist < 60) {
      this.vy = -5;
      this.vx = (dx > 0 ? 1 : -1) * 2.5;
      this.jumpCooldown = 80;
    }

    // Update fireballs
    this.fireballs = this.fireballs.filter(f => {
      f.x += f.vx;
      return f.x > -16 && f.x < scene.w + 16;
    });

    this.walkTimer++;
    if (this.walkTimer >= 7) { this.walkTimer = 0; this.walkFrame ^= 1; }
  }
}

// ---- GORIYA ----
export class Goriya extends Enemy {
  constructor(x, y) {
    super(x, y, 12, 16, 3, ENEMY_XP.goriya);
    this.type = 'goriya';
    this.walkSpeed = 0.9;
    this.damageAmount = 2;
    this.throwCooldown = 90;
    this.boomerang = null;
    this.walkFrame = 0;
    this.walkTimer = 0;
  }

  _aiUpdate(player, platforms, scene) {
    const dx = player.x - this.x;
    const dist = Math.abs(dx);

    this.throwCooldown = Math.max(0, this.throwCooldown - 1);

    // Throw boomerang
    if (this.throwCooldown <= 0 && !this.boomerang && dist < 120) {
      this.boomerang = {
        x: this.x, y: this.y + 8,
        vx: this.facing * 2.5, vy: -1,
        tx: player.x, ty: player.y,
        returning: false,
        damage: 2, w: 8, h: 8,
      };
      this.throwCooldown = 120;
    }

    // Update boomerang
    if (this.boomerang) {
      const b = this.boomerang;
      if (!b.returning) {
        b.x += b.vx;
        b.y += b.vy;
        b.vy += 0.05;
        // Return after reaching distance
        const bdx = b.x - this.x;
        if (Math.abs(bdx) > 80 || (Math.sign(b.vx) !== Math.sign(this.facing))) {
          b.returning = true;
        }
      } else {
        const rdx = this.x - b.x;
        const rdy = this.y + 8 - b.y;
        const rdist = Math.sqrt(rdx*rdx + rdy*rdy);
        if (rdist < 8) {
          this.boomerang = null;
        } else {
          b.x += (rdx/rdist) * 2.5;
          b.y += (rdy/rdist) * 2.5;
        }
      }
    }

    // Move
    if (dist > 16) {
      this.vx = (dx > 0 ? 1 : -1) * this.walkSpeed;
    } else {
      this.vx = 0;
    }

    this.walkTimer++;
    if (this.walkTimer >= 8) { this.walkTimer = 0; this.walkFrame ^= 1; }
  }
}

// ---- RAVENHORSE (guardian 1) ----
export class Horsehead extends Enemy {
  constructor(x, y) {
    super(x, y, 24, 24, 16, ENEMY_XP.horsehead);
    this.type = 'horsehead';
    this.walkSpeed = 0.5;
    this.damageAmount = 4;
    this.phase = 0;
    this.attackTimer = 0;
    this.maceActive = false;
    this.mace = null;
  }

  _aiUpdate(player, platforms, scene) {
    const dx = player.x - this.x;
    const dist = Math.abs(dx);

    this.attackTimer = Math.max(0, this.attackTimer - 1);

    // Phase 2 at half HP
    if (this.hp < this.maxHp / 2) this.phase = 1;

    const speed = this.walkSpeed * (1 + this.phase * 0.5);
    this.vx = (dx > 0 ? 1 : -1) * speed;

    // Swing mace
    if (dist < 40 && this.attackTimer <= 0) {
      this.attackTimer = 40;
      this.maceActive = true;
      this.mace = {
        x: this.x + (this.facing === 1 ? this.w : -16),
        y: this.y - 8,
        w: 12, h: 12,
        damage: 4, timer: 20,
      };
    }
    if (this.mace) {
      this.mace.timer--;
      this.mace.x = this.x + (this.facing === 1 ? this.w : -16);
      if (this.mace.timer <= 0) { this.mace = null; this.maceActive = false; }
    }

    // Jump in phase 2
    if (this.phase === 1 && this.onGround && combatRng.next(`horsehead#${this.id}.jumpDecision`) < 0.008) {
      this.vy = -5;
    }
  }

  takeDamage(amount, attackType = 'mid') {
    // Horsehead: head is weak spot (up attacks)
    if (attackType === 'mid' || attackType === 'low') return false; // body blocked
    return super.takeDamage(amount, attackType);
  }
}

// ---- CROWNBACK (guardian 2) ----
export class Helmethead extends Enemy {
  constructor(x, y) {
    super(x, y, 20, 24, 24, ENEMY_XP.helmethead);
    this.type = 'helmethead';
    this.walkSpeed = 0.7;
    this.damageAmount = 5;
    this.phase = 0;
    this.fireTimer = 60;
    this.fireballs = [];
    this.headShots = 0; // after 3 up-attacks, remove helmet
    this.helmetOff = false;
  }

  _aiUpdate(player, platforms, scene) {
    const dx = player.x - this.x;

    this.vx = (dx > 0 ? 1 : -1) * this.walkSpeed * (1 + this.phase * 0.3);

    this.fireTimer = Math.max(0, this.fireTimer - 1);
    if (this.fireTimer <= 0) {
      // Shoot fireballs
      this.fireballs.push({
        x: this.x + (this.facing === 1 ? this.w : -8),
        y: this.y + 4,
        vx: this.facing * 2,
        vy: combatRng.next(`helmethead#${this.id}.fireballVy`) * 2 - 1,
        w: 8, h: 8, damage: 3,
      });
      this.fireTimer = 60 - this.phase * 15;
    }

    this.fireballs = this.fireballs.filter(f => {
      f.x += f.vx; f.y += f.vy;
      return f.x > -16 && f.x < scene.w + 16;
    });

    if (this.hp < this.maxHp * 0.5) this.phase = 1;
  }

  takeDamage(amount, attackType = 'mid') {
    if (!this.helmetOff && attackType !== 'up') {
      // Head can only be hit from above until helmet is off
      if (attackType === 'up') {
        this.headShots++;
        if (this.headShots >= 3) this.helmetOff = true;
        return super.takeDamage(amount, attackType);
      }
      return false;
    }
    return super.takeDamage(amount, attackType);
  }
}

// ---- UMBRAKIN (final guardian) ----
export class DarkLink extends Enemy {
  constructor(x, y) {
    super(x, y, 8, 16, 50, 1000);
    this.type = 'darklink';
    this.damageAmount = 8;
    this.walkSpeed = 2;
    this.attackTimer = 0;
    this.attackCooldown = 0;
    this.jumpCooldown = 0;
    this.phase = 0;
    this.mirrorTimer = 0;
  }

  _aiUpdate(player, platforms, scene) {
    const dx = player.x - this.x;
    const dist = Math.abs(dx);

    this.attackCooldown = Math.max(0, this.attackCooldown - 1);
    this.jumpCooldown   = Math.max(0, this.jumpCooldown - 1);
    if (this.attackTimer > 0) this.attackTimer--;

    if (this.hp < this.maxHp * 0.5) this.phase = 1;
    if (this.hp < this.maxHp * 0.25) this.phase = 2;

    const spd = this.walkSpeed * (1 + this.phase * 0.5);

    // Mirror player actions (simplified)
    if (dist > 20) {
      this.vx = (dx > 0 ? 1 : -1) * spd;
    } else {
      this.vx = 0;
      // Attack
      if (this.attackCooldown <= 0) {
        this.attackTimer = 15;
        this.attackCooldown = 30 - this.phase * 5;
      }
    }

    // Jump
    if (this.onGround && this.jumpCooldown <= 0 && combatRng.next(`darklink#${this.id}.jumpDecision`) < 0.01 * (1 + this.phase)) {
      this.vy = -5;
      this.jumpCooldown = 60;
    }
  }

  get swordBox() {
    if (this.attackTimer <= 0) return null;
    return {
      x: this.x + (this.facing === 1 ? this.w : -16),
      y: this.y + 4,
      w: 16, h: 8,
    };
  }
}

// Enemy type ids the factory actually implements. Anything else (including
// palace-metadata boss ids that have no class here) hits the R7 fallback
// below, explicitly, rather than silently.
const IMPLEMENTED_TYPES = new Set([
  'ache', 'stalfos', 'wizzrobe', 'ironknuckle', 'lizalfos', 'goriya',
  'horsehead', 'helmethead', 'darklink',
]);

// Some keep metadata references guardians without dedicated classes. The
// factory keeps that fallback explicit and tags the spawned instance.
export function spawnEnemy(type, x, y, opts = {}) {
  if (!IMPLEMENTED_TYPES.has(type)) {
    console.warn(`[guardian-fallback] spawnEnemy: type "${type}" is not implemented; ` +
      'falling back to the default guardian.');
    const fallback = new Stalfos(x, y);
    fallback.isFallback = true;
    fallback.requestedType = type;
    return fallback;
  }
  switch (type) {
    case 'ache':        return new Ache(x, y);
    case 'stalfos':     return new Stalfos(x, y, opts.variant);
    case 'wizzrobe':    return new Wizzrobe(x, y);
    case 'ironknuckle': return new Ironknuckle(x, y, opts.color);
    case 'lizalfos':    return new Lizalfos(x, y);
    case 'goriya':      return new Goriya(x, y);
    case 'horsehead':   return new Horsehead(x, y);
    case 'helmethead':  return new Helmethead(x, y);
    case 'darklink':    return new DarkLink(x, y);
  }
}
