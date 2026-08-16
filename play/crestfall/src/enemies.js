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
    this.knockbackTimer = 0;
    this.walkFrame = 0;
  }

  update(player, platforms, scene) {
    if (!this.alive) return;
    if (this.iframes > 0) this.iframes--;
    this.timer++;
    if (this.knockbackTimer > 0) {
      this.knockbackTimer--;
      this.x += this.vx;
      this.vy *= 0.88;
    } else {
      this._aiUpdate(player, platforms, scene);
    }
    this._physics(platforms);
    if (this.iframes > 0) this.state = 'damage';
    else if (this.blocking) this.state = 'guard';
    else if (this.attackTimer > 0 || this.mace || this.attacking) {
      const timer = Number(this.attackTimer || this.mace?.timer || 0);
      this.state = timer > 12 ? 'windup' : timer < 6 ? 'recovery' : 'attack';
    }
    else if (!this.onGround) this.state = this.vy < 0 ? 'jump' : 'fall';
    else if (Math.abs(this.vx) > 0.05) this.state = 'walk';
    else this.state = 'idle';
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

// ---- DUSKWING; aerial scout ----
export class Duskwing extends Enemy {
  constructor(x, y) {
    super(x, y, 8, 6, 2, ENEMY_XP.duskwing);
    this.type = 'duskwing';
    this.ampX = 30 + combatRng.next(`duskwing#${this.id}.ampX`) * 20;
    this.ampY = 15 + combatRng.next(`duskwing#${this.id}.ampY`) * 10;
    this.startX = x;
    this.startY = y;
    this.phase = combatRng.next(`duskwing#${this.id}.phase`) * Math.PI * 2;
    this.speed = 0.04 + combatRng.next(`duskwing#${this.id}.speed`) * 0.02;
    this.chaseMode = false;
    this.damageAmount = 1;
  }

  _aiUpdate(player, platforms, scene) {
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const dist = Math.max(0.0001, Math.sqrt(dx*dx + dy*dy));

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
export class Boneward extends Enemy {
  constructor(x, y, variant = 'normal') {
    super(x, y, 12, 16, variant === 'hard' ? 4 : 2, ENEMY_XP.boneward);
    this.type = 'boneward';
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
      if (combatRng.next(`boneward#${this.id}.blockDecision`) < 0.01) {
        this.blocking = true;
        this.blockTimer = 40 + Math.floor(combatRng.next(`boneward#${this.id}.blockDuration`) * 40);
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
      if (combatRng.next(`boneward#${this.id}.jumpDecision`) < 0.015) {
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
    // Boneward blocks mid attacks if blocking
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
export class Hexweaver extends Enemy {
  constructor(x, y) {
    super(x, y, 10, 16, 3, ENEMY_XP.hexweaver);
    this.type = 'hexweaver';
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
      this.x = 30 + combatRng.next(`hexweaver#${this.id}.teleportX`) * (scene.w - 60);
      this.baseY = 80 + combatRng.next(`hexweaver#${this.id}.teleportY`) * 60;
      this.y = this.baseY;
      this.visible = true;
      this.teleportCooldown = 120 + Math.floor(combatRng.next(`hexweaver#${this.id}.teleportCooldown`) * 60);
    }

    // Shoot magic beam
    if (this.shootCooldown <= 0 && this.visible) {
      const dx = player.x - this.x;
      const dy = player.y - this.y;
      const dist = Math.max(0.0001, Math.sqrt(dx*dx + dy*dy));
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
    // Hexweaver floats - no normal physics
    this.x += this.vx;
  }

  takeDamage(amount, attackType = 'mid') {
    if (this.iframes > 0) return false;
    // MIRROR rune reflects arcane projectiles in SideView; direct strikes remain hittable.
    this.hp -= amount;
    this.iframes = 20;
    if (this.hp <= 0) { this.hp = 0; this.alive = false; }
    return true;
  }
}

// ---- IRONWRAITH ----
export class Ironwraith extends Enemy {
  constructor(x, y, color = 'gray') {
    super(x, y, 14, 16, 6, ENEMY_XP.ironwraith);
    this.type = 'ironwraith';
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
    if (combatRng.next(`ironwraith#${this.id}.blockDecision`) < this.blockChance) {
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
      if (this.color === 'orange' && combatRng.next(`ironwraith#${this.id}.throwDecision`) < 0.3) {
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
export class Brineclaw extends Enemy {
  constructor(x, y) {
    super(x, y, 12, 16, 4, ENEMY_XP.brineclaw);
    this.type = 'brineclaw';
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

// ---- CRESCENT ----
export class Crescent extends Enemy {
  constructor(x, y) {
    super(x, y, 12, 16, 3, ENEMY_XP.crescent);
    this.type = 'crescent';
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
        const rdist = Math.max(0.0001, Math.sqrt(rdx*rdx + rdy*rdy));
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
export class Ravenhorse extends Enemy {
  constructor(x, y) {
    super(x, y, 24, 24, 16, ENEMY_XP.ravenhorse);
    this.type = 'ravenhorse';
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

    if (this.hp < this.maxHp * 0.66) this.phase = 1;
    if (this.hp < this.maxHp * 0.33) this.phase = 2;

    const speed = this.walkSpeed * (1 + this.phase * 0.5);
    this.vx = (dx > 0 ? 1 : -1) * speed;

    // Swing mace
    if (dist < (this.phase > 1 ? 76 : 40) && this.attackTimer <= 0) {
      this.attackTimer = this.phase > 1 ? 30 : 40;
      this.maceActive = true;
      this.mace = {
        x: this.x + (this.facing === 1 ? this.w : -16),
        y: this.y - 8,
        w: this.phase > 1 ? 18 : 12, h: 12,
        damage: 4, timer: 20,
      };
    }
    if (this.mace) {
      this.mace.timer--;
      this.mace.x = this.x + (this.facing === 1 ? this.w : -16);
      if (this.mace.timer <= 0) { this.mace = null; this.maceActive = false; }
    }

    // Jump in phase 2
    if (this.phase > 0 && this.onGround && combatRng.next(`ravenhorse#${this.id}.jumpDecision`) < 0.008 * this.phase) {
      this.vy = -5;
    }
  }

  takeDamage(amount, attackType = 'mid') {
    // Ravenhorse: head is weak spot (up attacks)
    if (attackType === 'mid' || attackType === 'low') return false; // body blocked
    return super.takeDamage(amount, attackType);
  }
}

// ---- CROWNBACK (guardian 2) ----
export class Crownback extends Enemy {
  constructor(x, y) {
    super(x, y, 20, 24, 24, ENEMY_XP.crownback);
    this.type = 'crownback';
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

    if (this.hp < this.maxHp * 0.66) this.phase = 1;
    if (this.hp < this.maxHp * 0.33) this.phase = 2;
    this.vx = (dx > 0 ? 1 : -1) * this.walkSpeed * (1 + this.phase * 0.3);

    this.fireTimer = Math.max(0, this.fireTimer - 1);
    if (this.fireTimer <= 0) {
      // Shoot fireballs
      this.fireballs.push({
        x: this.x + (this.facing === 1 ? this.w : -8),
        y: this.y + 4,
        vx: this.facing * 2,
        vy: combatRng.next(`crownback#${this.id}.fireballVy`) * 2 - 1,
        w: 8, h: 8, damage: 3,
      });
      if (this.phase > 1) {
        this.fireballs.push({ x: this.x + (this.facing === 1 ? this.w : -8), y: this.y + 4,
          vx: this.facing * 2, vy: -1.2, w: 8, h: 8, damage: 3 });
      }
      this.fireTimer = 60 - this.phase * 15;
    }

    this.fireballs = this.fireballs.filter(f => {
      f.x += f.vx; f.y += f.vy;
      return f.x > -16 && f.x < scene.w + 16;
    });

  }

  takeDamage(amount, attackType = 'mid') {
    if (!this.helmetOff) {
      if (attackType === 'up') {
        this.headShots++;
        if (this.headShots >= 3) this.helmetOff = true;
        return super.takeDamage(amount, attackType);
      }
      // The plated body is sealed until three high strikes break the crown.
      return false;
    }
    return super.takeDamage(amount, attackType);
  }
}

// ---- STONEVEX (guardian 4) ----
export class Stonevex extends Enemy {
  constructor(x, y) {
    super(x, y, 28, 24, 34, 500);
    this.type = 'stonevex';
    this.walkSpeed = 0.45;
    this.damageAmount = 6;
    this.phase = 0;
    this.attackCooldown = 50;
    this.attackTimer = 0;
    this.mace = null;
    this.projectiles = [];
  }

  _aiUpdate(player, _platforms, scene) {
    const dx = player.x - this.x;
    const dist = Math.abs(dx);
    this.attackCooldown = Math.max(0, this.attackCooldown - 1);
    this.attackTimer = Math.max(0, this.attackTimer - 1);
    if (this.hp < this.maxHp * 0.66) this.phase = 1;
    if (this.hp < this.maxHp * 0.33) this.phase = 2;
    this.vx = dist > 30 ? (dx > 0 ? 1 : -1) * this.walkSpeed * (1 + this.phase * 0.4) : 0;
    if (dist < 58 && this.attackCooldown <= 0) {
      this.attackCooldown = this.phase > 1 ? 28 : this.phase ? 42 : 58;
      this.attackTimer = 18;
      this.mace = { x: this.x + (this.facing === 1 ? this.w : -18), y: this.y + 4, w: 18, h: 14, damage: 6, timer: 18 };
      if (this.phase) {
        this.projectiles.push({ x: this.x + this.w / 2, y: this.y + 10, vx: this.facing * 2.2, vy: -1.2, w: 8, h: 8, damage: 4, type: 'rock' });
        if (this.phase > 1) {
          this.projectiles.push({ x: this.x + this.w / 2, y: this.y + 10, vx: this.facing * 1.6, vy: -2.2, w: 8, h: 8, damage: 4, type: 'rock' });
          this.projectiles.push({ x: this.x + this.w / 2, y: this.y + 10, vx: this.facing * 1.6, vy: 0.2, w: 8, h: 8, damage: 4, type: 'rock' });
        }
      }
    }
    if (this.mace) {
      this.mace.timer--;
      this.mace.x = this.x + (this.facing === 1 ? this.w : -18);
      if (this.mace.timer <= 0) this.mace = null;
    }
    this.projectiles = this.projectiles.filter((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.06;
      return p.x > -16 && p.x < scene.w + 16 && p.y < scene.h + 16;
    });
  }
}

// ---- IRONROOT (guardian 5) ----
export class Ironroot extends Enemy {
  constructor(x, y) {
    super(x, y, 26, 26, 40, 600);
    this.type = 'ironroot';
    this.walkSpeed = 0.35;
    this.damageAmount = 7;
    this.phase = 0;
    this.shootCooldown = 65;
    this.projectiles = [];
    this.blocking = false;
  }

  _aiUpdate(player, _platforms, scene) {
    const dx = player.x - this.x;
    const dist = Math.abs(dx);
    this.shootCooldown = Math.max(0, this.shootCooldown - 1);
    if (this.hp < this.maxHp * 0.66) this.phase = 1;
    if (this.hp < this.maxHp * 0.33) this.phase = 2;
    this.blocking = this.timer % (this.phase > 1 ? 64 : this.phase ? 88 : 112) < 24;
    this.vx = this.blocking || dist < 24 ? 0 : (dx > 0 ? 1 : -1) * this.walkSpeed;
    if (this.shootCooldown <= 0) {
      const dy = player.y - this.y;
      const length = Math.max(0.0001, Math.hypot(dx, dy));
      this.projectiles.push({
        x: this.x + this.w / 2, y: this.y + 8,
        vx: dx / length * (this.phase ? 2.6 : 2), vy: dy / length * (this.phase ? 2.6 : 2),
        w: 8, h: 8, damage: 5, type: 'magic',
      });
      if (this.phase > 1) {
        this.projectiles.push({ x: this.x + this.w / 2, y: this.y + 8,
          vx: (dx / length) * 1.6 - 0.7, vy: (dy / length) * 1.6 - 0.6,
          w: 8, h: 8, damage: 5, type: 'magic' });
      }
      this.shootCooldown = this.phase > 1 ? 34 : this.phase ? 50 : 78;
    }
    this.projectiles = this.projectiles.filter((p) => {
      p.x += p.vx;
      p.y += p.vy;
      return p.x > -16 && p.x < scene.w + 16 && p.y > -16 && p.y < scene.h + 16;
    });
  }

  takeDamage(amount, attackType = 'mid') {
    if (this.blocking && attackType !== 'up') return false;
    return super.takeDamage(amount, attackType);
  }
}

// ---- TIDEBANE (guardian 6) ----
export class Tidebane extends Enemy {
  constructor(x, y) {
    super(x, y, 24, 24, 46, 700);
    this.type = 'tidebane';
    this.walkSpeed = 0.8;
    this.damageAmount = 7;
    this.phase = 0;
    this.attackCooldown = 45;
    this.attackTimer = 0;
    this.fireballs = [];
    this.mace = null;
  }

  _aiUpdate(player, _platforms, scene) {
    const dx = player.x - this.x;
    const dist = Math.abs(dx);
    this.attackCooldown = Math.max(0, this.attackCooldown - 1);
    if (this.hp < this.maxHp * 0.66) this.phase = 1;
    if (this.hp < this.maxHp * 0.33) this.phase = 2;
    this.vx = dist > 32 ? (dx > 0 ? 1 : -1) * this.walkSpeed * (1 + this.phase * 0.35) : 0;
    if (this.attackCooldown <= 0) {
      this.attackCooldown = this.phase > 1 ? 24 : this.phase ? 32 : 52;
      this.attackTimer = 20;
      this.mace = { x: this.x + (this.facing === 1 ? this.w : -16), y: this.y - 2, w: 16, h: 18, damage: 7, timer: 20 };
      this.fireballs.push({ x: this.x + this.w / 2, y: this.y + 6, vx: this.facing * 2.4, vy: -0.6, w: 8, h: 8, damage: 4, type: 'water' });
      if (this.phase > 1) this.fireballs.push({ x: this.x + this.w / 2, y: this.y + 6, vx: this.facing * 1.5, vy: -2.1, w: 8, h: 8, damage: 4, type: 'water' });
    }
    if (this.mace) {
      this.mace.timer--;
      this.mace.x = this.x + (this.facing === 1 ? this.w : -16);
      if (this.mace.timer <= 0) this.mace = null;
    }
    this.fireballs = this.fireballs.filter((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.04;
      return p.x > -16 && p.x < scene.w + 16 && p.y < scene.h + 16;
    });
  }
}

// ---- UMBRAKIN (final guardian) ----
export class Umbrakin extends Enemy {
  constructor(x, y) {
    super(x, y, 8, 16, 50, 1000);
    this.type = 'umbrakin';
    this.damageAmount = 8;
    this.walkSpeed = 2;
    this.attackTimer = 0;
    this.attackCooldown = 0;
    this.jumpCooldown = 0;
    this.phase = 0;
    this.mirrorTimer = 0;
    this.projectiles = [];
  }

  _aiUpdate(player, platforms, scene) {
    const dx = player.x - this.x;
    const dist = Math.abs(dx);

    this.attackCooldown = Math.max(0, this.attackCooldown - 1);
    this.jumpCooldown   = Math.max(0, this.jumpCooldown - 1);
    this.mirrorTimer = Math.max(0, this.mirrorTimer - 1);
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
        if (this.phase > 0) {
          this.projectiles.push({ x: this.x + (this.facing === 1 ? this.w : -10), y: this.y + 5,
            vx: this.facing * (2.2 + this.phase * 0.4), vy: this.phase > 1 ? -0.8 : 0,
            w: 10, h: 6, damage: 4 + this.phase, type: 'magic' });
        }
        if (this.phase > 1) this.mirrorTimer = 24;
      }
    }

    // Jump
    if (this.onGround && this.jumpCooldown <= 0 && combatRng.next(`umbrakin#${this.id}.jumpDecision`) < 0.01 * (1 + this.phase)) {
      this.vy = -5;
      this.jumpCooldown = 60;
    }
    this.projectiles = this.projectiles.filter((projectile) => {
      projectile.x += projectile.vx;
      projectile.y += projectile.vy;
      return projectile.x > -16 && projectile.x < scene.w + 16 && projectile.y > -16 && projectile.y < scene.h + 16;
    });
  }

  get swordBox() {
    if (this.attackTimer <= 0) return null;
    return {
      x: this.x + (this.facing === 1 ? this.w : -16),
      y: this.y + 4,
      w: 16, h: 8,
    };
  }

  takeDamage(amount, attackType = 'mid') {
    if (this.mirrorTimer > 0 && attackType === 'mid') return false;
    return super.takeDamage(amount, attackType);
  }
}

// Enemy type ids implemented by the factory.
const IMPLEMENTED_TYPES = new Set([
  'duskwing', 'boneward', 'hexweaver', 'ironwraith', 'brineclaw', 'crescent',
  'ravenhorse', 'crownback', 'stonevex', 'ironroot', 'tidebane', 'umbrakin',
]);

export function spawnEnemy(type, x, y, opts = {}) {
  if (!IMPLEMENTED_TYPES.has(type)) throw new Error(`Unknown enemy type: ${type}`);
  switch (type) {
    case 'duskwing':        return new Duskwing(x, y);
    case 'boneward':     return new Boneward(x, y, opts.variant);
    case 'hexweaver':    return new Hexweaver(x, y);
    case 'ironwraith': return new Ironwraith(x, y, opts.color);
    case 'brineclaw':    return new Brineclaw(x, y);
    case 'crescent':      return new Crescent(x, y);
    case 'ravenhorse':   return new Ravenhorse(x, y);
    case 'crownback':  return new Crownback(x, y);
    case 'stonevex':  return new Stonevex(x, y);
    case 'ironroot':  return new Ironroot(x, y);
    case 'tidebane':  return new Tidebane(x, y);
    case 'umbrakin':  return new Umbrakin(x, y);
  }
}
