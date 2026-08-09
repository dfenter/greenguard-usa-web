// Player state machine, physics, and stats
import { PLAYER, GRAVITY, MAX_FALL, XP_TABLE, ATK_POWER, SPELLS } from './constants.js';

export class Player {
  constructor() {
    this.reset();
  }

  reset() {
    // Position (NES pixels, sideview)
    this.x = 16;
    this.y = 160;
    this.w = 8;
    this.h = 16;
    this.vx = 0;
    this.vy = 0;
    this.facing = 1; // 1=right, -1=left
    this.onGround = false;

    // State machine
    this.state = 'stand'; // stand|walk|jump|fall|crouch|attack|attackup|attackdown|damage|dead
    this.attackTimer = 0;
    this.attackDuration = 12;
    this.iframes = 0;     // invincibility frames after hit
    this.damageTimer = 0;

    // Combat
    this.swordActive = false;
    this.swordBox = null; // {x,y,w,h}

    // Projectiles from fire spell
    this.fireballs = [];
    this.swordBeam = null;

    // Animation
    this.walkFrame = 0;
    this.walkTimer = 0;

    // Lives
    this.lives = PLAYER.LIVES;

    // RPG stats
    this.atkLvl = PLAYER.START_ATK;
    this.magLvl = PLAYER.START_MAG;
    this.lifLvl = PLAYER.START_LIF;
    this.xp = 0;
    this.score = 0;

    // Containers collected
    // R1 repair: this MUST be assigned before _calcMaxHp/_calcMaxMp are
    // called below, since both read lifeContainers/magicContainers. The
    // original source computed maxHp/maxMp first, reading these fields
    // while still `undefined`, producing NaN health/magic from the very
    // first reset() (see reviews/sol_port_spec_review_2026-07-18.md,
    // "NaN health/magic" finding, player.js:48-56 vs 381-386).
    this.lifeContainers = PLAYER.START_HEARTS;
    this.magicContainers = PLAYER.START_MAGIC;

    // Health / Magic
    this.maxHp = this._calcMaxHp();
    this.hp = this.maxHp;
    this.maxMp = this._calcMaxMp();
    this.mp = this.maxMp;

    // Spells known
    this.spells = {};       // spell name → true
    this.activeSpells = {}; // spell name → remaining duration in frames
    this.selectedSpell = null;

    // Inventory
    this.keys = 0;
    this.crystals = 0; // palaces cleared

    // Overworld position - start on road near North Palace (row 1, col 8)
    this.owX = 8;
    this.owY = 1;
  }

  // Sideview logic called every frame
  update(input, platforms, enemies, scene) {
    if (this.state === 'dead') return;

    // Tick iframes
    if (this.iframes > 0) this.iframes--;
    if (this.damageTimer > 0) {
      this.damageTimer--;
      if (this.damageTimer === 0 && this.state === 'damage') {
        this.state = this.onGround ? 'stand' : 'fall';
      }
    }

    // Active spell ticks
    for (const [name, frames] of Object.entries(this.activeSpells)) {
      if (frames <= 0) delete this.activeSpells[name];
      else this.activeSpells[name]--;
    }

    // Attack timer
    if (this.attackTimer > 0) {
      this.attackTimer--;
      if (this.attackTimer === 0) {
        this.swordActive = false;
        this.swordBox = null;
        if (this.state === 'attack' || this.state === 'attackup' || this.state === 'attackdown') {
          this.state = this.onGround ? (this._isMoving(input) ? 'walk' : 'stand') : 'fall';
        }
      }
    }

    if (this.state === 'damage') return;

    // --- Input processing ---
    const attacking = this.attackTimer > 0;

    // Jump
    if (!attacking && input.pressA && this.onGround) {
      this.vy = PLAYER.JUMP_VEL;
      if (this.spells.JUMP && this.activeSpells.JUMP) {
        this.vy = PLAYER.JUMP_VEL * 1.6; // super jump
      }
      this.onGround = false;
      this.state = 'jump';
    }

    // Horizontal movement (not while crouching)
    if (!attacking || this.state === 'attackup' || this.state === 'attackdown') {
      if (input.left) {
        this.vx = -PLAYER.WALK_SPEED;
        this.facing = -1;
        if (this.onGround && !attacking) this.state = 'walk';
      } else if (input.right) {
        this.vx = PLAYER.WALK_SPEED;
        this.facing = 1;
        if (this.onGround && !attacking) this.state = 'walk';
      } else {
        this.vx = 0;
        if (this.onGround && !attacking && this.state === 'walk') this.state = 'stand';
      }
    } else if (attacking && this.state === 'attack') {
      this.vx = 0;
    }

    // Crouch
    if (!attacking && this.onGround && input.down && !input.pressA) {
      this.state = 'crouch';
      this.vx = 0;
    } else if (this.state === 'crouch' && !input.down) {
      this.state = 'stand';
    }

    // Attack
    if (input.pressB && !attacking) {
      this._startAttack(input);
    }

    // Directional ward semantics: standing stance blocks high attacks,
    // crouched stance blocks low attacks.
    // INTENDED semantics: standing shield blocks HIGH attacks, crouch
    // shield blocks LOW attacks. The prior code computed `shielding` as
    // `... && this.state !== 'crouch'`, which made the crouch case inert
    // (crouch is set by the block above whenever grounded+down+!attack, so
    // this condition could never see state==='crouch' AND be true at the
    // same time as the crouch check preceding it) — holding down made
    // shielding unreachable entirely. Repaired: both standing and crouching
    // shield, tagged with the stance they defend.
    this.shielding = this.onGround && !attacking && (this.state === 'stand' || this.state === 'crouch');
    this.shieldStance = this.state === 'crouch' ? 'low' : 'high';

    // --- Physics ---
    // Gravity
    if (!this.onGround) {
      this.vy += GRAVITY;
      if (this.vy > MAX_FALL) this.vy = MAX_FALL;
    }

    // Move X
    this.x += this.vx;

    // Move Y
    this.y += this.vy;

    // Platform collision
    this.onGround = false;
    this._collidePlatforms(platforms);

    // Clamp to scene bounds
    if (this.x < 0) this.x = 0;
    if (this.x + this.w > scene.w) this.x = scene.w - this.w;

    // Fell off bottom
    if (this.y > scene.h + 32) {
      this._die();
      return;
    }

    // Update sword hitbox
    this._updateSwordBox();

    // Update projectiles
    this._updateProjectiles(scene);

    // Animation
    this._updateAnim(input);

    // Sword beam at full HP
    if (this.hp >= this.maxHp && !this.swordBeam && this.swordActive && this.state === 'attack') {
      this._fireSwordBeam();
    }
  }

  _startAttack(input) {
    this.attackTimer = this.attackDuration;
    this.swordActive = true;
    if (!this.onGround && input.down) {
      this.state = 'attackdown';
    } else if (input.up) {
      this.state = 'attackup';
    } else {
      this.state = 'attack';
    }
  }

  _updateSwordBox() {
    if (!this.swordActive) { this.swordBox = null; return; }
    const bw = 16, bh = 8;
    const by = 6; // offset from top of player
    if (this.state === 'attack') {
      this.swordBox = this.facing === 1
        ? { x: this.x + this.w, y: this.y + by, w: bw, h: bh }
        : { x: this.x - bw,     y: this.y + by, w: bw, h: bh };
    } else if (this.state === 'attackup') {
      this.swordBox = { x: this.x, y: this.y - 12, w: this.w, h: 12 };
    } else if (this.state === 'attackdown') {
      this.swordBox = { x: this.x, y: this.y + this.h, w: this.w, h: 12 };
    } else {
      this.swordBox = null;
    }
  }

  _collidePlatforms(platforms) {
    for (const p of platforms) {
      // AABB
      if (this.x + this.w > p.x && this.x < p.x + p.w &&
          this.y + this.h > p.y && this.y < p.y + p.h) {
        // From which direction?
        const prevBottom = this.y + this.h - this.vy;
        const prevRight  = this.x + this.w - this.vx;
        const prevLeft   = this.x - this.vx;

        if (prevBottom <= p.y && this.vy >= 0) {
          // Landing on top
          this.y = p.y - this.h;
          this.vy = 0;
          this.onGround = true;
          if (this.state === 'jump' || this.state === 'fall') {
            this.state = this._isHoldingDirection() ? 'walk' : 'stand';
          }
        } else if (prevLeft >= p.x + p.w) {
          this.x = p.x + p.w;
        } else if (prevRight <= p.x) {
          this.x = p.x - this.w;
        } else if (this.vy < 0) {
          this.y = p.y + p.h;
          this.vy = 0;
        }
      }
    }
  }

  _isMoving(input) { return input.left || input.right; }
  _isHoldingDirection() { return this.vx !== 0; }

  _updateAnim(input) {
    if (this.state === 'walk') {
      this.walkTimer++;
      if (this.walkTimer >= 8) { this.walkTimer = 0; this.walkFrame ^= 1; }
    } else {
      this.walkFrame = 0;
      this.walkTimer = 0;
    }
    if (!this.onGround && this.state !== 'jump' && this.state !== 'attack' &&
        this.state !== 'attackup' && this.state !== 'attackdown' && this.state !== 'damage') {
      this.state = 'fall';
    }
  }

  _updateProjectiles(scene) {
    // Fireballs
    this.fireballs = this.fireballs.filter(f => {
      f.x += f.vx;
      f.y += f.vy;
      // Simple gravity if needed
      return f.x > 0 && f.x < scene.w && f.y > 0 && f.y < scene.h;
    });
    // Sword beam
    if (this.swordBeam) {
      this.swordBeam.x += this.swordBeam.vx;
      if (this.swordBeam.x < 0 || this.swordBeam.x > scene.w) this.swordBeam = null;
    }
  }

  _fireSwordBeam() {
    this.swordBeam = {
      x: this.x + (this.facing === 1 ? this.w : -12),
      y: this.y + 4,
      vx: this.facing * 4,
      w: 8, h: 4,
    };
  }

  fireSpell() {
    if (!this.spells.FIRE || this.mp < 6) return;
    this.mp -= 6;
    this.fireballs.push({
      x: this.x + (this.facing === 1 ? this.w : -12),
      y: this.y + 4,
      vx: this.facing * 3,
      vy: 0,
      w: 8, h: 6,
    });
  }

  // attackType: 'high' | 'low' classifies the incoming attack's origin
  // relative to the player (see SideView._attackHeight). Defaults to a
  // neutral tag that matches neither stance, preserving "no shield can
  // block this" for callers that don't classify (matches pre-repair
  // behavior for those call sites, which is a deliberate, explicit gap
  // rather than the previous universal, direction-less reduction).
  takeDamage(amount, attackType = 'mid') {
    if (this.iframes > 0 || this.state === 'dead') return;
    // R5 repair: directional shield block. Standing shield blocks 'high'
    // attacks, crouch shield blocks 'low' attacks; a mismatched or
    // unclassified attackType is not blocked.
    if (this.shielding && this.shieldStance === attackType) {
      if (this.spells.SHIELD && this.activeSpells.SHIELD) {
        amount = Math.max(1, Math.floor(amount / 2));
      } else {
        amount = Math.max(1, Math.floor(amount * 0.75));
      }
    }
    this.hp -= amount;
    this.iframes = PLAYER.IFRAME_DURATION;
    this.damageTimer = 20;
    this.state = 'damage';
    // Knockback
    this.vx = this.facing * -2;
    this.vy = -2;
    if (this.hp <= 0) {
      this.hp = 0;
      this._die();
    }
  }

  _die() {
    this.state = 'dead';
    // lives decremented by Game._handleDeath to avoid double-decrement
  }

  gainXP(amount) {
    this.xp += amount;
    this._checkLevelUp();
  }

  _checkLevelUp() {
    // Check if any stat can level up
    let leveled = false;
    const attrs = ['atk','mag','lif'];
    for (const attr of attrs) {
      const lvlKey = attr + 'Lvl';
      const cur = this[lvlKey];
      if (cur >= 8) continue;
      const needed = XP_TABLE[attr][cur];
      if (this.xp >= needed) {
        // Will level up next player choice, flag it
        if (!this._pendingLevelUp) this._pendingLevelUp = [];
        if (!this._pendingLevelUp.includes(attr)) {
          this._pendingLevelUp.push(attr);
          leveled = true;
        }
      }
    }
    return leveled;
  }

  levelUp(attr) {
    const lvlKey = attr + 'Lvl';
    if (this[lvlKey] >= 8) return;
    this[lvlKey]++;
    // Refund XP to 0 for that track
    if (this[lvlKey] < 8) {
      // Set xp to the minimum for the new level (actual NES resets to 0)
      this.xp = 0;
    }
    if (attr === 'lif') {
      this.maxHp = this._calcMaxHp();
      this.hp = this.maxHp;
    }
    if (attr === 'mag') {
      this.maxMp = this._calcMaxMp();
      this.mp = this.maxMp;
    }
    // Remove from pending
    if (this._pendingLevelUp) {
      this._pendingLevelUp = this._pendingLevelUp.filter(a => a !== attr);
    }
  }

  _calcMaxHp() {
    return this.lifeContainers * (this.lifLvl * 2 + 8);
  }
  _calcMaxMp() {
    return this.magicContainers * (this.magLvl + 4);
  }

  learnSpell(name) {
    this.spells[name] = true;
  }

  castSpell(name) {
    const spell = SPELLS[name];
    if (!spell || !this.spells[name] || this.mp < spell.cost) return false;
    this.mp -= spell.cost;
    if (name === 'LIFE') {
      this.hp = Math.min(this.maxHp, this.hp + Math.floor(this.maxHp / 2));
      return true;
    }
    if (name === 'FIRE') {
      this.fireSpell();
      return true;
    }
    // Duration spells (300 frames = 5 seconds)
    const durSpells = ['SHIELD','JUMP','FAIRY','REFLECT','SPELL','THUNDER'];
    if (durSpells.includes(name)) {
      this.activeSpells[name] = 300;
      return true;
    }
    return true;
  }

  getSpriteState() {
    if (this.iframes > 0 && Math.floor(this.iframes / 4) % 2 === 0 && this.state !== 'damage') {
      return 'damage'; // flicker
    }
    return this.state === 'fall' ? 'jump' : this.state;
  }

  get atkPower() { return ATK_POWER[this.atkLvl] || 1; }
}
