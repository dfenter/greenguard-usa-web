/* entities.js — Link, enemies, projectiles, pickups.
   Entities are plain objects with .kind and an update(game) method.
   Collision uses game.solidAt(px,py). Combat hit-testing lives in game.js. */

const DIRS = { up:[0,-1], down:[0,1], left:[-1,0], right:[1,0] };

const Entities = (() => {

  // ---- shared movement with per-axis tile collision ----
  function boxSolid(game, x, y, w, h) {
    // sample the four corners + edge midpoints
    const pts = [
      [x, y], [x+w-1, y], [x, y+h-1], [x+w-1, y+h-1],
      [x+w/2, y], [x+w/2, y+h-1], [x, y+h/2], [x+w-1, y+h/2],
    ];
    for (const [px, py] of pts) if (game.solidAt(px, py)) return true;
    return false;
  }
  function tryMove(e, dx, dy, game, inset) {
    const ix = inset.x, iy = inset.y, iw = e.w - inset.x - inset.x2, ih = e.h - inset.y - inset.y2;
    // Escape-overlap rule: if the entity is ALREADY embedded in a solid (this
    // happens by design when a room transition drops Link onto the far side's
    // locked/shutter door tiles), allow movement so it can always walk out.
    const embedded = boxSolid(game, e.x + ix, e.y + iy, iw, ih);
    let moved = false;
    if (dx) {
      const nx = e.x + dx;
      if (embedded || !boxSolid(game, nx + ix, e.y + iy, iw, ih)) { e.x = nx; moved = true; }
    }
    if (dy) {
      const ny = e.y + dy;
      if (embedded || !boxSolid(game, e.x + ix, ny + iy, iw, ih)) { e.y = ny; moved = true; }
    }
    return moved;
  }
  const LINK_INSET = { x:2, x2:2, y:5, y2:1 };
  const ENEMY_INSET = { x:1, x2:1, y:1, y2:1 };

  function hitbox(e) { return { x:e.x, y:e.y, w:e.w, h:e.h }; }
  function overlap(a, b) {
    return a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y;
  }

  // ============================ LINK ============================
  function makeLink(px, py) {
    return {
      kind:'link', x:px, y:py, w:16, h:16, dir:'down',
      speed:1.4, moving:false, animTimer:0, frame:0,
      maxHealth:18, health:18,          // half-hearts (9 hearts)
      attackTimer:0, invuln:0, knock:null,
      bombs:8, rupees:0, keys:0,
      hasSword:false, hasBow:false, hasBoomerang:false, hasBomb:true, hasShield:true,
      hasCandle:false, hasRing:false, hasFireRod:false, hasSilverArrows:false,
      hasWhiteSword:false, hasMagicSword:false, hasStepladder:false, hasRaft:false, hasMagicKey:false,
      swordDmg:1,
      bItem:'bomb',
      triforce:false,
      update(game) {
        const K = game.keys, P = game.pressed;
        // knockback overrides control
        if (this.knock) {
          const k = this.knock;
          tryMove(this, k.dx, k.dy, game, LINK_INSET);
          k.t--; if (k.t <= 0) this.knock = null;
        } else if (this.attackTimer > 0) {
          this.moving = false;          // rooted during sword swing
        } else {
          let dx = 0, dy = 0;
          if (K.left) { dx = -1; this.dir = 'left'; }
          else if (K.right) { dx = 1; this.dir = 'right'; }
          else if (K.up) { dy = -1; this.dir = 'up'; }
          else if (K.down) { dy = 1; this.dir = 'down'; }
          this.moving = !!(dx || dy);
          if (this.moving) {
            // axis-lock + light grid alignment for clean door entry
            if (dx) { this.y = Math.round(this.y); }
            if (dy) { this.x = Math.round(this.x); }
            tryMove(this, dx * this.speed, dy * this.speed, game, LINK_INSET);
          }
          // attack
          if (P.a && this.hasSword && this.attackTimer <= 0) {
            this.attackTimer = 14; game.swordSwung = 8;
            Sound.SFX.sword();
            if (this.health >= this.maxHealth) {
              const [vx, vy] = DIRS[this.dir];
              game.spawn(makeProjectile('beam', this.x, this.y, this.dir, { vx, vy, speed:4, damage:this.swordDmg || 1 }));
              Sound.SFX.beam();
            }
          }
          // use B item
          if (P.b) this.useItem(game);
        }
        if (this.moving) { this.animTimer++; if (this.animTimer >= 8) { this.animTimer = 0; this.frame ^= 1; } }
        else this.frame = 0;
        if (this.attackTimer > 0) this.attackTimer--;
        if (this.invuln > 0) this.invuln--;
      },
      useItem(game) {
        if (this.bItem === 'bomb' && this.bombs > 0) {
          const [vx, vy] = DIRS[this.dir];
          game.spawn(makeBomb(this.x + vx*14, this.y + vy*14));
          this.bombs--;
        } else if (this.bItem === 'bow' && this.hasBow && this.rupees > 0) {
          const [vx, vy] = DIRS[this.dir];
          const arrowDmg = this.hasSilverArrows ? 4 : 2;
          game.spawn(makeProjectile('arrow', this.x, this.y, this.dir, { vx, vy, speed:5, damage:arrowDmg, fromEnemy:false }));
          this.rupees--; Sound.SFX.beam();
        } else if (this.bItem === 'boomerang' && this.hasBoomerang) {
          if (!game.entities.some(e => e.kind==='proj' && e.ptype==='boomerang')) {
            const [vx, vy] = DIRS[this.dir];
            game.spawn(makeBoomerang(this.x, this.y, vx, vy, this));
            Sound.SFX.sword();
          }
        } else if (this.bItem === 'candle' && this.hasCandle) {
          if (!game.entities.some(e => e.kind==='proj' && e.ptype==='flame')) {
            const [vx, vy] = DIRS[this.dir];
            game.spawn(makeProjectile('flame', this.x, this.y, this.dir,
              { vx, vy, speed:2.2, damage:1, life:36, fromEnemy:false }));
            Sound.SFX.beam();
          }
        } else if (this.bItem === 'firerod' && this.hasFireRod && this.rupees >= 4) {
          const [vx, vy] = DIRS[this.dir];
          const p = makeProjectile('fireblast', this.x, this.y, this.dir, { vx, vy, speed:2.5, damage:2, life:48, fromEnemy:false });
          p.w = 20; p.h = 20;
          game.spawn(p);
          this.rupees -= 4; Sound.SFX.beam();
        }
      },
      hurt(game, dmg, srcx, srcy) {
        if (this.invuln > 0 || this.knock) return;
        if (this.hasRing) dmg = Math.max(1, Math.ceil(dmg / 2));   // Blue Ring halves damage
        this.health = Math.max(0, this.health - dmg);
        this.invuln = 60;
        Sound.SFX.hurt();
        // knockback away from source
        const ang = Math.atan2(this.y - srcy, this.x - srcx);
        this.knock = { dx: Math.cos(ang) * 3, dy: Math.sin(ang) * 3, t: 8 };
        if (this.health <= 0) game.onLinkDead();
      },
      draw(ctx, ox, oy) {
        if (this.invuln > 0 && (this.invuln >> 2) & 1) return;   // blink
        const set = Sprites.get('link')[this.dir];
        const sp = set[this.frame % set.length];
        Sprites.blit(ctx, sp, (this.x|0)+ox, (this.y|0)+oy);
      }
    };
  }

  // ============================ ENEMIES ============================
  function tilePx(t) { return t * 16; }

  function makeEnemy(type, variant, tx, ty) {
    const base = {
      kind:'enemy', etype:type, variant, x:tilePx(tx), y:tilePx(ty), w:16, h:16,
      dir:'down', hp:1, speed:0.7, moveTimer:0, shootTimer:60,
      frame:0, animTimer:0, flash:0, knock:null, touchDmg:1, value:1,
    };
    const cfg = ENEMY_CFG[type] || {};
    Object.assign(base, cfg.init ? cfg.init(variant) : {});
    base.update = function(game) { (cfg.update || octorokUpdate)(this, game); commonPost(this, game); };
    base.draw = function(ctx, ox, oy) { (cfg.draw || defaultDraw)(this, ctx, ox, oy); };
    base.hurt = function(game, dmg, kx, ky) { (cfg.hurt || enemyHurt)(this, game, dmg, kx, ky); };
    return base;
  }

  function commonPost(e, game) {
    if (e.flash > 0) e.flash--;
    if (e.knock) {
      tryMove(e, e.knock.dx, e.knock.dy, game, ENEMY_INSET);
      e.knock.t--; if (e.knock.t <= 0) e.knock = null;
    }
    e.animTimer++; if (e.animTimer >= 12) { e.animTimer = 0; e.frame ^= 1; }
    // contact damage (submerged/hidden enemies are intangible)
    if (!e.hidden && overlap(hitbox(e), hitbox(game.link)))
      game.link.hurt(game, e.touchDmg, e.x + 8, e.y + 8);
  }
  function enemyHurt(e, game, dmg, kx, ky) {
    if (e.flash > 4) return;
    e.hp -= dmg; e.flash = 10; Sound.SFX.enemyHit();
    const ang = Math.atan2(e.y - ky, e.x - kx);
    e.knock = { dx: Math.cos(ang) * 4, dy: Math.sin(ang) * 4, t: 6 };
    if (e.hp <= 0) { e.alive = false; Sound.SFX.enemyDie(); game.onEnemyKilled(e); }
  }
  function defaultDraw(e, ctx, ox, oy) {
    const sp = spriteFor(e);
    if (e.flash > 0 && (e.flash & 1)) { ctx.globalAlpha = 0.4; }
    Sprites.blit(ctx, sp, (e.x|0)+ox, (e.y|0)+oy);
    ctx.globalAlpha = 1;
  }
  function spriteFor(e) {
    switch (e.etype) {
      case 'octorok': return Sprites.get('octorok')[e.variant === 'blue' ? 'blue' : 'red'];
      case 'moblin':  return e.variant === 'blue' ? Sprites.get('moblin_blue') : Sprites.get('moblin');
      case 'tektite': return Sprites.get('tektite')[e.variant === 'blue' ? 'blue' : 'orange'];
      case 'leever':  return Sprites.get('leever');
      case 'zola':    return Sprites.get('zola');
      case 'keese':   return Sprites.get('keese');
      case 'stalfos': return Sprites.get('stalfos');
      case 'gel':     return Sprites.get('gel')[e.variant === 'blue' ? 'blue' : 'green'];
      case 'lynel':   return Sprites.get('lynel');
      case 'goriya':     return Sprites.get('goriya') ? (e.variant==='blue' ? Sprites.get('goriya').blue : Sprites.get('goriya').brown) : Sprites.get('moblin');
      case 'ironknuckle':return Sprites.get('ironknuckle') || Sprites.get('stalfos');
      case 'darknut':    return Sprites.get('darknut') || Sprites.get('stalfos');
      case 'wizzrobe':   return Sprites.get('wizzrobe') || Sprites.get('octorok').red;
      case 'likelike':   return Sprites.get('likelike') || Sprites.get('leever');
      default:        return Sprites.get('octorok').red;
    }
  }

  // wander in cardinal directions, occasionally change, shoot in facing dir
  function wander(e, game, changeChance) {
    if (e.knock) return;
    const [vx, vy] = DIRS[e.dir];
    const moved = tryMove(e, vx * e.speed, vy * e.speed, game, ENEMY_INSET);
    if (!moved || game.rand() < changeChance) {
      e.dir = game.choice(['up','down','left','right']);
    }
  }
  function octorokUpdate(e, game) {
    wander(e, game, 0.02);
    if (--e.shootTimer <= 0) {
      e.shootTimer = game.randInt(80, 150);
      const [vx, vy] = DIRS[e.dir];
      game.spawn(makeProjectile('rock', e.x, e.y, e.dir, { vx, vy, speed:2.2, damage:1, fromEnemy:true }));
    }
  }
  function moblinUpdate(e, game) {
    wander(e, game, 0.02);
    if (--e.shootTimer <= 0) {
      e.shootTimer = game.randInt(70, 130);
      const [vx, vy] = DIRS[e.dir];
      game.spawn(makeProjectile('spear', e.x, e.y, e.dir, { vx, vy, speed:2.6, damage:1, fromEnemy:true }));
    }
  }
  function tektiteUpdate(e, game) {
    if (e.knock) return;
    if (e.jump > 0) {
      e.x += e.jvx; e.y += e.jvy; e.jump--;
      // simple collision: keep in play bounds
      if (e.x < 4 || e.x > 236) { e.jvx *= -1; e.x += e.jvx; }
      if (e.y < 4 || e.y > 160) { e.jvy *= -1; e.y += e.jvy; }
    } else if (--e.rest <= 0) {
      e.rest = game.randInt(20, 50);
      e.jump = 22;
      e.jvx = (game.rand() - 0.5) * 4;
      e.jvy = -1.2 - game.rand() * 1.2;
      // bias toward player horizontally
      e.jvx += (game.link.x > e.x ? 0.6 : -0.6);
    }
  }
  function leeverUpdate(e, game) {
    if (e.knock) return;
    if (e.state === 'hidden') {
      e.hidden = true;
      if (--e.timer <= 0) { e.state = 'up'; e.timer = 160; e.hidden = false; }
      return;
    }
    e.hidden = false;
    // move toward player
    const dx = game.link.x - e.x, dy = game.link.y - e.y;
    if (Math.abs(dx) > Math.abs(dy)) e.dir = dx < 0 ? 'left' : 'right';
    else e.dir = dy < 0 ? 'up' : 'down';
    const [vx, vy] = DIRS[e.dir];
    tryMove(e, vx * e.speed, vy * e.speed, game, ENEMY_INSET);
    if (--e.timer <= 0) { e.state = 'hidden'; e.timer = game.randInt(60, 120); }
  }
  function zolaUpdate(e, game) {
    // surfaces, shoots a fireball at player, submerges; stays near its spot
    if (e.state === 'down') {
      e.hidden = true;
      if (--e.timer <= 0) { e.state = 'up'; e.timer = 90; e.hidden = false; }
      return;
    }
    e.hidden = false;
    if (e.timer === 70) {
      const dx = game.link.x - e.x, dy = game.link.y - e.y;
      const m = Math.hypot(dx, dy) || 1;
      game.spawn(makeProjectile('fireball', e.x, e.y, 'down',
        { vx: dx/m, vy: dy/m, speed:2.2, damage:1, fromEnemy:true }));
    }
    if (--e.timer <= 0) { e.state = 'down'; e.timer = game.randInt(60, 120); }
  }

  // Keese: erratic flight, bursts of motion with pauses
  function keeseUpdate(e, game) {
    if (e.knock) return;
    if (--e.t <= 0) {
      e.t = game.randInt(20, 50);
      const ang = game.rand() * 6.283;
      e.vx = Math.cos(ang) * (1 + game.rand()); e.vy = Math.sin(ang) * (1 + game.rand());
      if (game.rand() < 0.3) { e.vx = 0; e.vy = 0; }   // perch
    }
    if (e.vx || e.vy) {
      if (!tryMove(e, e.vx, e.vy, game, ENEMY_INSET)) { e.vx *= -1; e.vy *= -1; }
    }
  }
  // Stalfos: cardinal wander, tougher, no projectile
  function stalfosUpdate(e, game) { wander(e, game, 0.03); }
  // Gel: small, slow, drifts toward player in short hops
  function gelUpdate(e, game) {
    if (e.knock) return;
    if (--e.t <= 0) {
      e.t = game.randInt(25, 45);
      const dx = game.link.x - e.x, dy = game.link.y - e.y;
      const m = Math.hypot(dx, dy) || 1;
      e.vx = dx / m * (0.8 + game.rand()); e.vy = dy / m * (0.8 + game.rand());
    }
    if (!tryMove(e, e.vx, e.vy, game, ENEMY_INSET)) { e.vx *= -1; e.vy *= -1; }
  }
  // Goriya: wanders, throws boomerang, waits for return
  function goriyaUpdate(e, game) {
    if (e.boomOut) return;
    wander(e, game, 0.025);
    if (--e.shootTimer <= 0) {
      e.shootTimer = game.randInt(60, 120);
      const [vx, vy] = DIRS[e.dir];
      const boom = makeBoomerang(e.x, e.y, vx, vy, e);
      boom._goriya = e;
      game.spawn(boom);
      e.boomOut = true;
      const origUpdate = boom.update.bind(boom);
      boom.update = function(g) {
        origUpdate(g);
        if (!this.alive) e.boomOut = false;
      };
    }
  }
  // Iron Knuckle: chases player, fires beams at low HP
  function ironKnuckleUpdate(e, game) {
    if (e.knock) return;
    if (--e.moveTimer <= 0) {
      e.moveTimer = game.randInt(40, 80);
      const dx = game.link.x - e.x, dy = game.link.y - e.y;
      if (Math.abs(dx) > Math.abs(dy)) e.dir = dx < 0 ? 'left' : 'right';
      else e.dir = dy < 0 ? 'up' : 'down';
    }
    const [vx, vy] = DIRS[e.dir];
    if (!tryMove(e, vx * e.speed, vy * e.speed, game, ENEMY_INSET)) e.moveTimer = 0;
    if (e.hp < 2 && --e.shootTimer <= 0) {
      e.shootTimer = game.randInt(80, 140);
      game.spawn(makeProjectile('beam', e.x, e.y, e.dir, { vx, vy, speed:3, damage:2, fromEnemy:true }));
    }
  }
  // Darknut: chases player, blocks front hits
  function darknutUpdate(e, game) {
    if (e.knock) return;
    if (--e.moveTimer <= 0) {
      e.moveTimer = game.randInt(30, 60);
      const dx = game.link.x - e.x, dy = game.link.y - e.y;
      if (Math.abs(dx) > Math.abs(dy)) e.dir = dx < 0 ? 'left' : 'right';
      else e.dir = dy < 0 ? 'up' : 'down';
    }
    const [vx, vy] = DIRS[e.dir];
    tryMove(e, vx * e.speed, vy * e.speed, game, ENEMY_INSET);
  }
  // Wizzrobe: teleports, shoots aimed beams
  function wizzrobeUpdate(e, game) {
    if (--e.teleTimer <= 0) {
      e.teleTimer = game.randInt(50, 80);
      // retry teleports that would land inside a solid tile
      for (let tries = 0; tries < 12; tries++) {
        const nx = 16 + Math.floor(game.rand() * 12) * 16;
        const ny = 16 + Math.floor(game.rand() * 8) * 16;
        if (!game.solidAt(nx + 8, ny + 8)) { e.x = nx; e.y = ny; break; }
      }
    }
    if (--e.shootTimer <= 0) {
      e.shootTimer = game.randInt(60, 100);
      const dx = game.link.x - e.x, dy = game.link.y - e.y;
      const m = Math.hypot(dx, dy) || 1;
      game.spawn(makeProjectile('beam', e.x, e.y, 'down', { vx:dx/m, vy:dy/m, speed:2.5, damage:1, fromEnemy:true }));
    }
  }
  // Like Like: slow wander, eats Link's ring on contact
  function likeLikeUpdate(e, game) {
    wander(e, game, 0.02);
    if (overlap(hitbox(e), hitbox(game.link))) {
      e.eatTimer = (e.eatTimer || 0) + 1;
      if (e.eatTimer >= 3 && game.link.hasRing) {
        game.link.hasRing = false;
        game.msg = 'RING STOLEN!'; game.msgT = 160;
      }
    } else {
      e.eatTimer = 0;
    }
  }

  // Lynel: cardinal wander toward player, fires sword beams
  function lynelUpdate(e, game) {
    if (e.knock) return;
    if (--e.moveTimer <= 0) {
      e.moveTimer = game.randInt(30, 60);
      const dx = game.link.x - e.x, dy = game.link.y - e.y;
      if (Math.abs(dx) > Math.abs(dy)) e.dir = dx < 0 ? 'left' : 'right';
      else e.dir = dy < 0 ? 'up' : 'down';
    }
    const [vx, vy] = DIRS[e.dir];
    if (!tryMove(e, vx * e.speed, vy * e.speed, game, ENEMY_INSET)) e.moveTimer = 0;
    if (--e.shootTimer <= 0) {
      e.shootTimer = game.randInt(70, 120);
      game.spawn(makeProjectile('beam', e.x, e.y, e.dir, { vx, vy, speed:3, damage:1, fromEnemy:true }));
    }
  }

  const ENEMY_CFG = {
    octorok: { init:(v)=>({ hp:1, speed:0.7, shootTimer:90, value: v==='blue'?2:1 }), update:octorokUpdate },
    moblin:  { init:(v)=>({ hp:2, speed:0.65, shootTimer:80, value:2 }), update:moblinUpdate },
    tektite: { init:()=>({ hp:1, speed:0, rest:30, jump:0, jvx:0, jvy:0, value:1 }), update:tektiteUpdate },
    leever:  { init:()=>({ hp:2, speed:0.8, state:'hidden', hidden:true, timer:40, value:2 }), update:leeverUpdate,
               draw:(e,ctx,ox,oy)=>{ if(e.hidden) return; defaultDraw(e,ctx,ox,oy); } },
    zola:    { init:()=>({ hp:2, speed:0, state:'up', hidden:false, timer:90, value:2, touchDmg:1 }), update:zolaUpdate,
               draw:(e,ctx,ox,oy)=>{ if(e.hidden) return; defaultDraw(e,ctx,ox,oy); } },
    keese:   { init:()=>({ hp:1, speed:0, t:1, vx:0, vy:0, value:1 }), update:keeseUpdate },
    stalfos: { init:()=>({ hp:2, speed:0.7, value:2, touchDmg:1 }), update:stalfosUpdate },
    gel:     { init:()=>({ hp:1, speed:0, t:1, vx:0, vy:0, value:1, w:10, h:10 }), update:gelUpdate },
    lynel:   { init:()=>({ hp:4, speed:0.9, shootTimer:60, moveTimer:30, value:5, touchDmg:2 }), update:lynelUpdate },
    goriya:  { init:(v)=>({ hp: v==='blue'?4:2, speed:0.7, shootTimer:80, boomOut:false, value:3, touchDmg:1 }), update:goriyaUpdate },
    ironknuckle: { init:()=>({ hp:4, speed:0.4, shootTimer:9999, moveTimer:40, value:5, touchDmg:2 }), update:ironKnuckleUpdate },
    darknut: {
      init:()=>({ hp:3, speed:0.6, moveTimer:40, value:4, touchDmg:2 }),
      update:darknutUpdate,
      hurt:(e,game,dmg,kx,ky)=>{
        const dx = kx - e.x, dy = ky - e.y;
        let hitDir;
        if (Math.abs(dx) > Math.abs(dy)) hitDir = dx > 0 ? 'right' : 'left';
        else hitDir = dy > 0 ? 'down' : 'up';
        const OPPOSITE = {left:'right',right:'left',up:'down',down:'up'};
        if (hitDir === OPPOSITE[e.dir]) return;
        enemyHurt(e, game, dmg, kx, ky);
      }
    },
    wizzrobe:{ init:()=>({ hp:2, speed:0, teleTimer:50, shootTimer:80, value:3, touchDmg:1 }), update:wizzrobeUpdate },
    likelike:{ init:()=>({ hp:2, speed:0.3, value:2, touchDmg:1 }), update:likeLikeUpdate },
  };

  // ============================ BOSS: Aquamentus ============================
  function makeAquamentus(tx, ty, opts = {}) {
    const e = makeEnemy('octorok', 'red', tx, ty);  // reuse scaffolding
    const variant = opts.variant || 'green';
    const hp = variant === 'blue' ? 10 : variant === 'red' ? 8 : 6;
    e.etype = 'aquamentus'; e.boss = true; e.variant = variant;
    e.w = 24; e.h = 32; e.hp = hp; e.maxhp = hp; e.touchDmg = 2;
    e.speed = variant === 'blue' ? 0.7 : variant === 'red' ? 0.55 : 0.4;
    e.nballs = variant === 'green' ? 3 : variant === 'red' ? 4 : 5;
    e.x = tilePx(tx); e.y = tilePx(ty); e.value = 0;
    e.vy = e.speed; e.shootTimer = 90;
    e.update = function(game) {
      if (this.flash > 0) this.flash--;
      if (this.knock) { this.knock.t--; if (this.knock.t<=0) this.knock=null; }
      // bob vertically on the right side
      this.y += this.vy;
      if (this.y < 16) { this.y = 16; this.vy = Math.abs(this.vy); }
      if (this.y > 132) { this.y = 132; this.vy = -Math.abs(this.vy); }
      if (--this.shootTimer <= 0) {
        this.shootTimer = game.randInt(70, 120);
        // fireballs in a leftward spread (count scales with variant)
        const n = this.nballs, spread = 0.6;
        for (let i = 0; i < n; i++) {
          const off = n === 1 ? 0 : (i / (n - 1) - 0.5) * 2 * spread;
          game.spawn(makeProjectile('fireball', this.x, this.y + 12, 'left',
            { vx:-1, vy:off, speed:2.0, damage:1, fromEnemy:true }));
        }
      }
      if (overlap(hitbox(this), hitbox(game.link)))
        game.link.hurt(game, this.touchDmg, this.x+12, this.y+16);
    };
    e.draw = function(ctx, ox, oy) {
      const sp = Sprites.get('aquamentus')[this.variant] || Sprites.get('aquamentus').green;
      if (this.flash > 0 && (this.flash & 1)) ctx.globalAlpha = 0.4;
      Sprites.blit(ctx, sp, (this.x|0)+ox, (this.y|0)+oy);
      ctx.globalAlpha = 1;
    };
    e.hurt = function(game, dmg, kx, ky) {
      if (this.flash > 4) return;
      this.hp -= dmg; this.flash = 8; Sound.SFX.enemyHit();
      if (this.hp <= 0) { this.alive = false; Sound.SFX.enemyDie(); game.onBossKilled(this); }
    };
    return e;
  }

  // ============================ BOSS: Gleeok ============================
  function makeGleeok(tx, ty, opts = {}) {
    const headHp = opts.headHp || 4;
    const extraFireballs = opts.extraFireballs || 0;
    const heads = [
      { x: 180, y: 40, hp: headHp, detached: false, dx: 1.5, dy: 1.0 },
      { x: 200, y: 80, hp: headHp, detached: false, dx: -1.5, dy: 0.8 },
    ];
    const e = {
      kind:'enemy', etype:'gleeok', boss:true, variant:'green',
      x: 160, y: 48, w: 48, h: 64,
      hp: 1, touchDmg: 2, value: 0,
      flash: 0, knock: null, alive: true,
      heads,
      bodyShootTimer: 90,
      update(game) {
        if (this.flash > 0) this.flash--;
        for (const h of this.heads) {
          if (h.hp <= 0 && h.detached) continue; // dead flying head
          if (h.detached) {
            h.x += h.dx; h.y += h.dy;
            if (h.x < 8 || h.x > 240) h.dx *= -1;
            if (h.y < 8 || h.y > 164) h.dy *= -1;
            if (--h.shootTimer <= 0) {
              h.shootTimer = game.randInt(60, 100);
              const dx = game.link.x - h.x, dy = game.link.y - h.y;
              const m = Math.hypot(dx, dy) || 1;
              game.spawn(makeProjectile('fireball', h.x, h.y, 'down', { vx:dx/m, vy:dy/m, speed:2.2, damage:2, fromEnemy:true }));
            }
            const hbox = { x:h.x-6, y:h.y-6, w:12, h:12 };
            if (overlap(hbox, hitbox(game.link)))
              game.link.hurt(game, 2, h.x, h.y);
          } else {
            if (h.shootTimer === undefined) h.shootTimer = game.randInt(60, 100);
            if (--h.shootTimer <= 0) {
              h.shootTimer = game.randInt(60, 100);
              const dx = game.link.x - h.x, dy = game.link.y - h.y;
              const m = Math.hypot(dx, dy) || 1;
              const numShots = 1 + extraFireballs;
              for (let s = 0; s < numShots; s++) {
                const spread = (s - (numShots-1)/2) * 0.25;
                const nm = Math.hypot(dx/m + spread, dy/m) || 1;
                game.spawn(makeProjectile('fireball', h.x, h.y, 'down', {
                  vx:(dx/m+spread)/nm, vy:(dy/m)/nm, speed:2.0, damage:2, fromEnemy:true
                }));
              }
            }
          }
        }
        if (overlap(hitbox(this), hitbox(game.link)))
          game.link.hurt(game, this.touchDmg, this.x + 24, this.y + 32);
        if (this.heads.every(h => h.hp <= 0)) {
          this.alive = false; Sound.SFX.enemyDie(); game.onBossKilled(this);
        }
      },
      hurt(game, dmg, kx, ky) {
        let best = null, bestD = Infinity;
        for (const h of this.heads) {
          if (h.detached || h.hp <= 0) continue;
          const d = Math.hypot(h.x - kx, h.y - ky);
          if (d < bestD) { bestD = d; best = h; }
        }
        if (!best) {
          for (const h of this.heads) {
            if (h.hp <= 0) continue;
            const d = Math.hypot(h.x - kx, h.y - ky);
            if (d < bestD) { bestD = d; best = h; }
          }
        }
        if (!best) return;
        if (this.flash > 4) return;
        best.hp -= dmg; this.flash = 10; Sound.SFX.enemyHit();
        if (best.hp <= 0 && !best.detached) {
          best.detached = true;
          best.shootTimer = game.randInt(60, 100);
          best.dx = (game.rand() - 0.5) * 3;
          best.dy = (game.rand() - 0.5) * 3;
        }
      },
      draw(ctx, ox, oy) {
        if (this.flash > 0 && (this.flash & 1)) ctx.globalAlpha = 0.4;
        ctx.fillStyle = '#006020';
        ctx.fillRect((this.x|0)+ox+8, (this.y|0)+oy+20, 32, 40);
        ctx.fillStyle = '#004010';
        ctx.fillRect((this.x|0)+ox+10, (this.y|0)+oy+24, 8, 8);
        ctx.fillRect((this.x|0)+ox+28, (this.y|0)+oy+24, 8, 8);
        for (const h of this.heads) {
          if (h.hp <= 0) continue; // head fully dead (or dead+detached)
          ctx.strokeStyle = '#004010'; ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo((this.x|0)+ox+24, (this.y|0)+oy+20);
          ctx.lineTo((h.x|0)+ox, (h.y|0)+oy);
          ctx.stroke();
          ctx.fillStyle = h.detached ? '#d82828' : '#008030';
          ctx.fillRect((h.x|0)+ox-8, (h.y|0)+oy-8, 16, 16);
          ctx.fillStyle = '#fff';
          ctx.fillRect((h.x|0)+ox-5, (h.y|0)+oy-4, 3, 3);
          ctx.fillRect((h.x|0)+ox+2, (h.y|0)+oy-4, 3, 3);
          ctx.fillStyle = '#d82828';
          ctx.fillRect((h.x|0)+ox-4, (h.y|0)+oy+2, 8, 2);
          if (!h.detached) {
            ctx.fillStyle = '#600';
            ctx.fillRect((h.x|0)+ox-8, (h.y|0)+oy-12, 16, 2);
            ctx.fillStyle = '#0f0';
            ctx.fillRect((h.x|0)+ox-8, (h.y|0)+oy-12, Math.max(0,(h.hp/headHp)*16)|0, 2);
          }
        }
        ctx.globalAlpha = 1;
      }
    };
    for (const h of heads) h.shootTimer = 60 + Math.floor(Engine.rand() * 40);   // deterministic RNG
    return e;
  }

  // ============================ BOSS: Dodongo ============================
  // Armored rhino — swords and arrows clink off. Feed it bombs: it swallows a
  // placed (unexploded) bomb in front of its mouth and takes internal damage;
  // two swallowed bombs kill it. Blast damage only stuns it.
  function makeDodongo(tx, ty, opts = {}) {
    const pair = !!opts.pair;   // harder variant: needs 3 bombs
    const e = {
      kind:'enemy', etype:'dodongo', boss:true, variant: pair ? 'red' : 'green',
      x: tilePx(tx), y: tilePx(ty), w: 26, h: 18,
      hp: pair ? 3 : 2,            // bombs swallowed to kill
      touchDmg: 2, value: 0, alive: true,
      dir:'left', speed: 0.45, moveTimer: 60, flash: 0, stun: 0, knock: null,
      swallow: 0,
      update(game) {
        if (this.flash > 0) this.flash--;
        if (this.swallow > 0) { this.swallow--; return; }   // gulp pause
        if (this.stun > 0) { this.stun--; }
        else {
          if (--this.moveTimer <= 0) {
            this.moveTimer = game.randInt(50, 100);
            this.dir = game.choice(['up','down','left','right']);
          }
          const [vx, vy] = DIRS[this.dir];
          if (!tryMove(this, vx * this.speed, vy * this.speed, game, ENEMY_INSET)) this.moveTimer = 0;
        }
        // mouth zone: one tile ahead of facing
        const [fx, fy] = DIRS[this.dir];
        const mouth = { x: this.x + 5 + fx * 16, y: this.y + 2 + fy * 16, w: 16, h: 14 };
        for (const b of game.entities) {
          if (b.kind === 'proj' && b.ptype === 'bomb' && b.alive !== false && b.exploding <= 0 &&
              overlap(mouth, hitbox(b))) {
            b.alive = false;             // swallowed whole
            this.swallow = 40; this.flash = 24;
            Sound.SFX.enemyHit();
            if (--this.hp <= 0) { this.alive = false; Sound.SFX.enemyDie(); game.onBossKilled(this); }
            return;
          }
        }
        if (overlap(hitbox(this), hitbox(game.link)))
          game.link.hurt(game, this.touchDmg, this.x + 13, this.y + 9);
      },
      hurt(game, dmg, kx, ky, src) {
        // bomb BLAST stuns; everything else clinks off the armor
        if (src === 'blast') { this.stun = 90; this.flash = 8; Sound.SFX.enemyHit(); return; }
        Sound.SFX.enemyHit();   // clink — no damage
      },
      draw(ctx, ox, oy) {
        const x = (this.x|0)+ox, y = (this.y|0)+oy;
        if (this.flash > 0 && (this.flash & 1)) ctx.globalAlpha = 0.4;
        const body = this.variant === 'red' ? '#c05820' : '#58a028';
        const dark = this.variant === 'red' ? '#803008' : '#306010';
        // body
        ctx.fillStyle = body; ctx.fillRect(x, y + 2, 26, 14);
        ctx.fillStyle = dark; ctx.fillRect(x + 2, y + 4, 22, 3);
        // legs
        ctx.fillStyle = dark;
        ctx.fillRect(x + 3, y + 15, 4, 3); ctx.fillRect(x + 19, y + 15, 4, 3);
        // head toward facing
        const hx = this.dir === 'left' ? x - 4 : this.dir === 'right' ? x + 22 : x + 9;
        const hy = this.dir === 'up' ? y - 4 : this.dir === 'down' ? y + 12 : y + 2;
        ctx.fillStyle = body; ctx.fillRect(hx, hy, 8, 8);
        ctx.fillStyle = '#fff'; ctx.fillRect(hx + 2, hy + 2, 2, 2);
        // stun stars
        if (this.stun > 0 && ((this.stun >> 3) & 1)) {
          ctx.fillStyle = '#f8d030';
          ctx.fillRect(x + 4, y - 4, 2, 2); ctx.fillRect(x + 18, y - 6, 2, 2);
        }
        ctx.globalAlpha = 1;
      }
    };
    return e;
  }

  // ============================ BOSS: Manhandla ============================
  // Four snapping heads around a drifting core; kill each head, the plant
  // speeds up as heads die. Body is invulnerable while any head lives.
  function makeManhandla(tx, ty, opts = {}) {
    const headHp = opts.headHp || 2;
    const mk = (dx, dy) => ({ dx, dy, hp: headHp, chomp: Engine.rand() * 6.28, shootTimer: 60 + Math.floor(Engine.rand() * 60) });
    const e = {
      kind:'enemy', etype:'manhandla', boss:true, variant:'green',
      x: tilePx(tx), y: tilePx(ty), w: 16, h: 16,
      hp: 1, touchDmg: 2, value: 0, alive: true, flash: 0, knock: null,
      heads: [mk(-14, 0), mk(14, 0), mk(0, -14), mk(0, 14)],
      vx: 0.7, vy: 0.5,
      update(game) {
        if (this.flash > 0) this.flash--;
        const aliveHeads = this.heads.filter(h => h.hp > 0);
        const spd = 1 + (this.heads.length - aliveHeads.length) * 0.45;   // speeds up
        this.x += this.vx * spd; this.y += this.vy * spd;
        if (this.x < 20 || this.x > 220) this.vx *= -1;
        if (this.y < 20 || this.y > 140) this.vy *= -1;
        for (const h of aliveHeads) {
          h.chomp += 0.15;
          if (--h.shootTimer <= 0) {
            h.shootTimer = game.randInt(90, 160);
            const hx = this.x + 8 + h.dx, hy = this.y + 8 + h.dy;
            const dx = game.link.x - hx, dy = game.link.y - hy;
            const m = Math.hypot(dx, dy) || 1;
            game.spawn(makeProjectile('fireball', hx - 4, hy - 4, 'down',
              { vx: dx/m, vy: dy/m, speed: 2.0, damage: 1, fromEnemy: true }));
          }
          const hb = { x: this.x + h.dx, y: this.y + h.dy, w: 16, h: 16 };
          if (overlap(hb, hitbox(game.link))) game.link.hurt(game, 2, hb.x + 8, hb.y + 8);
        }
        if (aliveHeads.length === 0) {
          this.alive = false; Sound.SFX.enemyDie(); game.onBossKilled(this);
        }
      },
      hurt(game, dmg, kx, ky) {
        if (this.flash > 4) return;
        // nearest living head to the hit point takes it; body is armored
        let best = null, bestD = 20;   // must actually hit near a head
        for (const h of this.heads) {
          if (h.hp <= 0) continue;
          const d = Math.hypot((this.x + 8 + h.dx) - kx, (this.y + 8 + h.dy) - ky);
          if (d < bestD) { bestD = d; best = h; }
        }
        if (!best) { Sound.SFX.enemyHit(); return; }   // clink off the core
        best.hp -= dmg; this.flash = 10; Sound.SFX.enemyHit();
      },
      draw(ctx, ox, oy) {
        const x = (this.x|0)+ox, y = (this.y|0)+oy;
        if (this.flash > 0 && (this.flash & 1)) ctx.globalAlpha = 0.4;
        // core
        ctx.fillStyle = '#106838'; ctx.fillRect(x + 2, y + 2, 12, 12);
        ctx.fillStyle = '#f8d030'; ctx.fillRect(x + 6, y + 6, 4, 4);
        for (const h of this.heads) {
          if (h.hp <= 0) continue;
          const hx = x + h.dx, hy = y + h.dy;
          const open = (Math.sin(h.chomp) + 1) / 2;   // 0 closed .. 1 open
          ctx.fillStyle = '#30a040';
          ctx.fillRect(hx, hy + 3, 16, 10);
          // jaws
          ctx.fillStyle = '#d82828';
          const gap = 2 + open * 4;
          ctx.fillRect(hx + 2, hy + 8 - gap/2, 12, 1 + gap);
          ctx.fillStyle = '#fff';
          ctx.fillRect(hx + 2, hy + 7 - gap/2, 12, 2);
          ctx.fillRect(hx + 2, hy + 9 + gap/2 - 1, 12, 2);
        }
        ctx.globalAlpha = 1;
      }
    };
    return e;
  }

  // ============================ FX (spawn puff / death poof) ============================
  function makeFx(fxkind, x, y) {
    return {
      kind:'fx', fxkind, x, y, w:16, h:16, t:0, life: 18, alive: true,
      update() { if (++this.t >= this.life) this.alive = false; },
      draw(ctx, ox, oy) {
        const x = (this.x|0)+ox, y = (this.y|0)+oy;
        const p = this.t / this.life;                       // 0..1
        const cols = this.fxkind === 'poof' ? ['#fff','#f8d030','#f87800'] : ['#88c8f8','#fff','#c8e8f8'];
        ctx.fillStyle = cols[(this.t >> 2) % cols.length];
        // four clouds flying outward from center
        const d = 2 + p * 8, s = Math.max(1, 5 - p * 4);
        ctx.fillRect(x + 8 - d - s/2, y + 8 - s/2, s, s);
        ctx.fillRect(x + 8 + d - s/2, y + 8 - s/2, s, s);
        ctx.fillRect(x + 8 - s/2, y + 8 - d - s/2, s, s);
        ctx.fillRect(x + 8 - s/2, y + 8 + d - s/2, s, s);
      }
    };
  }

  // ============================ PROJECTILES ============================
  function makeProjectile(ptype, x, y, dir, o) {
    return {
      kind:'proj', ptype, x:x+4, y:y+4, w:8, h:8, dir,
      vx:o.vx, vy:o.vy, speed:o.speed, damage:o.damage, fromEnemy:!!o.fromEnemy,
      life: o.life || 140, alive:true,
      update(game) {
        this.x += this.vx * this.speed; this.y += this.vy * this.speed;
        if (--this.life <= 0) { this.alive = false; return; }
        // hit wall
        if (game.solidAt(this.x + 4, this.y + 4)) { this.alive = false; return; }
        // out of play
        if (this.x < -8 || this.x > 264 || this.y < -8 || this.y > 184) this.alive = false;
        if (this.fromEnemy) {
          if (overlap(hitbox(this), hitbox(game.link))) {
            // shield: blocks rock/spear/arrow coming at Link's facing side
            // (not while mid-swing; fireballs and magic beams punch through)
            const l = game.link;
            const BLOCKABLE = { rock:1, spear:1, arrow:1 };
            if (l.hasShield && l.attackTimer <= 0 && BLOCKABLE[this.ptype]) {
              const fromDir = Math.abs(this.vx) > Math.abs(this.vy)
                ? (this.vx > 0 ? 'left' : 'right')   // travelling right → hits Link's left-facing shield
                : (this.vy > 0 ? 'up' : 'down');
              if (l.dir === fromDir) {
                this.alive = false;
                Sound.SFX.enemyHit();   // deflect clink
                return;
              }
            }
            l.hurt(game, this.damage, this.x, this.y);
            this.alive = false;
          }
        } else {
          for (const en of game.entities) {
            if (en.kind === 'enemy' && en.alive !== false && !en.hidden && overlap(hitbox(this), hitbox(en))) {
              en.hurt(game, this.damage, this.x, this.y);
              this.alive = false;
              break;
            }
          }
        }
      },
      draw(ctx, ox, oy) { drawProj(this, ctx, ox, oy); }
    };
  }
  function drawProj(p, ctx, ox, oy) {
    const x = (p.x|0)+ox, y = (p.y|0)+oy;
    switch (p.ptype) {
      case 'rock':   ctx.fillStyle = '#f8d8a0'; ctx.fillRect(x, y, 7, 7);
                     ctx.fillStyle = '#a06000'; ctx.fillRect(x+1, y+1, 2, 2); break;
      case 'spear':  ctx.fillStyle = '#c0c0c0'; ctx.fillRect(x, y+2, 8, 3);
                     ctx.fillStyle = '#7a4010'; ctx.fillRect(x+ (p.vx<0?6:0), y+2, 2, 3); break;
      case 'arrow':  ctx.fillStyle = '#e0e0e0';
                     if (Math.abs(p.vx) > Math.abs(p.vy)) ctx.fillRect(x, y+3, 9, 2);
                     else ctx.fillRect(x+3, y, 2, 9); break;
      case 'fireball': {
        const f = ((p.life>>2)&1);
        ctx.fillStyle = f ? '#f87800' : '#f8d030';
        ctx.beginPath(); ctx.arc(x+4, y+4, 4, 0, 7); ctx.fill();
        ctx.fillStyle = '#d82828'; ctx.fillRect(x+3, y+3, 2, 2); break; }
      case 'beam': {
        ctx.fillStyle = ((p.life>>1)&1) ? '#fff' : '#78c8f8';
        if (Math.abs(p.vx) > Math.abs(p.vy)) ctx.fillRect(x-2, y+2, 12, 4);
        else ctx.fillRect(x+2, y-2, 4, 12); break; }
      case 'flame': {
        const f = ((p.life>>1)&1);
        ctx.fillStyle = f ? '#f87800' : '#f8d030';
        ctx.beginPath(); ctx.arc(x+4, y+5, 5, 0, 7); ctx.fill();
        ctx.fillStyle = f ? '#f8d030' : '#fff'; ctx.beginPath(); ctx.arc(x+4, y+5, 2, 0, 7); ctx.fill();
        ctx.fillStyle = '#d82828'; ctx.fillRect(x+2, y, 4, 3); break; }
      case 'fireblast': {
        const f = ((p.life>>1)&1);
        ctx.fillStyle = f ? '#f87800' : '#f8d030';
        ctx.beginPath(); ctx.arc(x+10, y+10, 10, 0, 7); ctx.fill();
        ctx.fillStyle = f ? '#f8d030' : '#fff';
        ctx.beginPath(); ctx.arc(x+10, y+10, 5, 0, 7); ctx.fill();
        ctx.fillStyle = '#d82828'; ctx.fillRect(x+7, y+1, 6, 5); break; }
    }
  }

  function makeBoomerang(x, y, vx, vy, owner) {
    return {
      kind:'proj', ptype:'boomerang', x:x+4, y:y+4, w:10, h:10,
      vx, vy, speed:3.5, returning:false, t:0, alive:true, owner, spin:0,
      update(game) {
        this.spin += 0.5; this.t++;
        if (!this.returning) {
          this.x += this.vx * this.speed; this.y += this.vy * this.speed;
          if (this.t > 16 || game.solidAt(this.x+5, this.y+5)) this.returning = true;
        } else {
          const dx = (this.owner.x+4) - this.x, dy = (this.owner.y+4) - this.y;
          const m = Math.hypot(dx, dy) || 1;
          this.x += dx/m * 4; this.y += dy/m * 4;
          if (m < 6) this.alive = false;
        }
        // stun enemies, collect items
        for (const en of game.entities) {
          if (en.kind === 'enemy' && en.alive !== false && !en.hidden && overlap(hitbox(this), hitbox(en))) {
            en.flash = 12; en.knock = { dx:this.vx*2, dy:this.vy*2, t:8 };
            if (en.hp <= 1) en.hurt(game, 1, this.x, this.y);
          }
          if (en.kind === 'item' && en.alive !== false && this.owner.kind === 'link' &&
              overlap(hitbox(this), hitbox(en))) {
            en.x = this.owner.x; en.y = this.owner.y;  // pull toward link (never a Goriya)
          }
        }
      },
      draw(ctx, ox, oy) {
        const x = (this.x|0)+ox, y = (this.y|0)+oy;
        ctx.fillStyle = '#f8d030';
        ctx.fillRect(x, y+ ((this.spin|0)%2?0:3), 10, 3);
        ctx.fillRect(x+ ((this.spin|0)%2?3:0), y, 3, 10);
      }
    };
  }

  function makeBomb(x, y) {
    return {
      kind:'proj', ptype:'bomb', x, y, w:10, h:12, fuse:75, exploding:0, alive:true,
      update(game) {
        if (this.exploding > 0) {
          this.exploding--; this.w = 40; this.h = 40; this.x = this._cx-20; this.y = this._cy-20;
          // damage enemies in blast
          for (const en of game.entities) {
            if (en.kind === 'enemy' && en.alive !== false && !en.hidden && overlap(hitbox(this), hitbox(en)))
              en.hurt(game, 4, this._cx, this._cy, 'blast');
          }
          if (this.exploding <= 0) this.alive = false;
          return;
        }
        if (--this.fuse <= 0) {
          this._cx = this.x + 5; this._cy = this.y + 6;
          this.exploding = 22; Sound.SFX.bomb();
          if (game.onBombBlast) game.onBombBlast(this._cx, this._cy);   // secrets hook
        }
      },
      draw(ctx, ox, oy) {
        const x = (this.x|0)+ox, y = (this.y|0)+oy;
        if (this.exploding > 0) {
          const r = 20 * (1 - Math.abs(this.exploding-11)/11) + 6;
          ctx.fillStyle = (this.exploding & 1) ? '#fff' : '#f87800';
          ctx.beginPath(); ctx.arc(x+20, y+20, r, 0, 7); ctx.fill();
          ctx.fillStyle = (this.exploding & 1) ? '#f8d030' : '#d82828';
          ctx.beginPath(); ctx.arc(x+20, y+20, r*0.5, 0, 7); ctx.fill();
        } else {
          ctx.fillStyle = (this.fuse < 20 && (this.fuse&2)) ? '#fff' : '#202020';
          ctx.fillRect(x, y+2, 10, 10);
          ctx.fillStyle = '#888'; ctx.fillRect(x+4, y, 3, 3);
        }
      }
    };
  }

  // ============================ PICKUPS ============================
  function makeItem(kind, x, y, opts={}) {
    return {
      kind:'item', item:kind, x, y, w:14, h:14, alive:true, life: opts.life || 0, t:0,
      permanent: !!opts.permanent,
      update(game) {
        this.t++;
        if (this.life && !this.permanent && --this.life <= 0) this.alive = false;
        if (this._refuseCD > 0) { this._refuseCD--; }
        else if (overlap(hitbox(this), hitbox(game.link))) {
          game.collect(this);
          // collect() sets _keep to refuse the pickup (e.g. unworthy of magic sword)
          if (this._keep) { this._keep = false; this._refuseCD = 90; }
          else this.alive = false;
        }
      },
      draw(ctx, ox, oy) { drawItem(this, ctx, ox, oy); }
    };
  }
  function drawItem(it, ctx, ox, oy) {
    const x = (it.x|0)+ox, y = (it.y|0)+oy;
    const blink = it.life && it.life < 90 && (it.life & 2);
    if (blink) return;
    switch (it.item) {
      case 'heart':
        ctx.fillStyle = '#d82828';
        ctx.fillRect(x+1,y+2,4,4); ctx.fillRect(x+8,y+2,4,4);
        ctx.fillRect(x,y+4,13,4); ctx.fillRect(x+2,y+8,9,2); ctx.fillRect(x+4,y+10,5,2); break;
      case 'rupee':
        ctx.fillStyle = (it.t>>3)&1 ? '#34b233' : '#1c7000';
        ctx.fillRect(x+4,y,5,2); ctx.fillRect(x+2,y+2,9,2); ctx.fillRect(x+1,y+4,11,6);
        ctx.fillRect(x+2,y+10,9,2); ctx.fillRect(x+4,y+12,5,2);
        ctx.fillStyle='#a8f0a8'; ctx.fillRect(x+4,y+3,2,6); break;
      case 'rupee5':
        ctx.fillStyle = (it.t>>3)&1 ? '#3858f8' : '#1830a0';
        ctx.fillRect(x+4,y,5,2); ctx.fillRect(x+2,y+2,9,2); ctx.fillRect(x+1,y+4,11,6);
        ctx.fillRect(x+2,y+10,9,2); ctx.fillRect(x+4,y+12,5,2);
        ctx.fillStyle='#a8c8f8'; ctx.fillRect(x+4,y+3,2,6); break;
      case 'fairy': {
        const f=(it.t>>2)&1;
        ctx.fillStyle='#f078c0'; ctx.fillRect(x+4,y+4,5,6);
        ctx.fillStyle='#f8c8e8'; ctx.fillRect(x+(f?0:9),y+2,4,5); ctx.fillRect(x+(f?9:0),y+2,4,5); break; }
      case 'bomb':
        ctx.fillStyle='#202020'; ctx.fillRect(x+1,y+3,11,10);
        ctx.fillStyle='#888'; ctx.fillRect(x+5,y,3,4); break;
      case 'key':
        ctx.fillStyle='#f8d030'; ctx.fillRect(x+3,y+1,7,7); ctx.fillStyle='#000'; ctx.fillRect(x+5,y+3,3,3);
        ctx.fillStyle='#f8d030'; ctx.fillRect(x+6,y+8,2,5); ctx.fillRect(x+6,y+11,4,2); break;
      case 'bow':
        ctx.fillStyle='#d8a020'; ctx.fillRect(x+3,y,2,14); ctx.fillRect(x+3,y,5,2); ctx.fillRect(x+3,y+12,5,2);
        ctx.fillStyle='#fff'; ctx.fillRect(x+4,y+6,9,2); break;
      case 'boomerang':
        ctx.fillStyle='#d8a020'; ctx.fillRect(x+1,y+6,5,3); ctx.fillRect(x+1,y+1,3,6);
        ctx.fillRect(x+1,y+1,8,3); break;
      case 'candle': {
        const f=(it.t>>2)&1;
        ctx.fillStyle=f?'#f8d030':'#f87800'; ctx.beginPath(); ctx.arc(x+6,y+2,3,0,7); ctx.fill();
        ctx.fillStyle='#fff'; ctx.fillRect(x+5,y+4,2,2);
        ctx.fillStyle='#d82828'; ctx.fillRect(x+3,y+6,6,8); ctx.fillStyle='#f08080'; ctx.fillRect(x+4,y+7,2,6); break; }
      case 'ring': {
        ctx.fillStyle='#3858f8'; ctx.beginPath(); ctx.arc(x+6,y+7,6,0,7); ctx.fill();
        ctx.fillStyle='#000'; ctx.beginPath(); ctx.arc(x+6,y+7,3,0,7); ctx.fill();
        ctx.fillStyle='#78c8f8'; ctx.fillRect(x+4,y,4,4); break; }
      case 'triforce': {
        const f=(it.t>>2)&1; ctx.fillStyle = f ? '#f8d030':'#f8f870';
        // triangle of three triangles
        ctx.fillRect(x+5,y+1,4,1); ctx.fillRect(x+4,y+2,6,2); ctx.fillRect(x+3,y+4,8,2);
        ctx.fillRect(x+2,y+6,4,2); ctx.fillRect(x+8,y+6,4,2);
        ctx.fillRect(x+1,y+8,5,2); ctx.fillRect(x+8,y+8,5,2);
        ctx.fillRect(x,y+10,6,2); ctx.fillRect(x+8,y+10,6,2); break; }
      case 'heartcontainer':
        ctx.fillStyle='#d82828';
        ctx.fillRect(x+2,y+3,4,4); ctx.fillRect(x+9,y+3,4,4);
        ctx.fillRect(x+1,y+5,14,5); ctx.fillRect(x+3,y+10,10,2); ctx.fillRect(x+5,y+12,5,2);
        ctx.fillStyle='#f8a8a8'; ctx.fillRect(x+3,y+5,2,3); break;
      case 'whiteword':
      case 'whitesword':
        ctx.fillStyle = '#e0e0ff'; ctx.fillRect(x+3, y, 3, 13);
        ctx.fillStyle = '#c0c0ff'; ctx.fillRect(x+4, y, 1, 13);
        ctx.fillStyle = '#a0a0ff'; ctx.fillRect(x, y+11, 9, 2);
        ctx.fillStyle = '#8888cc'; ctx.fillRect(x+3, y+13, 3, 3); break;
      case 'magicsword':
        ctx.fillStyle = '#f8d030'; ctx.fillRect(x+3, y, 3, 13);
        ctx.fillStyle = '#c0a000'; ctx.fillRect(x+4, y, 1, 13);
        ctx.fillStyle = '#9038e0'; ctx.fillRect(x, y+11, 9, 2);
        ctx.fillStyle = '#601090'; ctx.fillRect(x+3, y+13, 3, 3); break;
      case 'stepladder':
        ctx.fillStyle = '#c8a060';
        ctx.fillRect(x+1, y+1, 2, 12); ctx.fillRect(x+10, y+1, 2, 12);
        ctx.fillStyle = '#8a6030';
        ctx.fillRect(x+3, y+3, 7, 2); ctx.fillRect(x+3, y+7, 7, 2); ctx.fillRect(x+3, y+11, 7, 2); break;
      case 'raft':
        ctx.fillStyle = '#8a5a20';
        ctx.fillRect(x, y+7, 14, 3); ctx.fillRect(x, y+10, 14, 2);
        ctx.fillStyle = '#c8a060';
        ctx.fillRect(x, y+7, 14, 1); ctx.fillRect(x, y+10, 14, 1);
        ctx.fillStyle = '#888';
        ctx.fillRect(x+6, y+1, 2, 7);
        ctx.fillStyle = '#f8d030';
        ctx.fillRect(x+8, y+1, 5, 4); break;
      case 'magickey':
        ctx.fillStyle = '#f8d030';
        ctx.beginPath(); ctx.arc(x+5, y+4, 4, 0, 7); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(x+5, y+4, 2, 0, 7); ctx.fill();
        ctx.fillStyle = '#f8d030';
        ctx.fillRect(x+8, y+3, 5, 2);
        ctx.fillRect(x+10, y+5, 2, 2); ctx.fillRect(x+12, y+5, 2, 2);
        ctx.fillStyle = '#9038e0';
        ctx.fillRect(x+4, y+3, 2, 2); break;
      case 'silverarrows':
        ctx.fillStyle = '#e8e8ff';
        ctx.fillRect(x+3, y, 2, 14);
        ctx.fillStyle = '#c0c0ff';
        ctx.fillRect(x+1, y+2, 6, 2);
        ctx.fillStyle = '#9090ff';
        ctx.fillRect(x+1, y+11, 2, 2); ctx.fillRect(x+5, y+11, 2, 2); break;
      case 'firerod':
        ctx.fillStyle = '#d82828';
        ctx.fillRect(x+6, y+1, 3, 11);
        ctx.fillStyle = '#f87800';
        ctx.beginPath(); ctx.arc(x+7, y+1, 4, 0, 7); ctx.fill();
        ctx.fillStyle = '#f8d030';
        ctx.beginPath(); ctx.arc(x+7, y+1, 2, 0, 7); ctx.fill();
        ctx.fillStyle = '#a06000';
        ctx.fillRect(x+5, y+12, 5, 3); break;
    }
  }

  return {
    makeLink, makeEnemy, makeAquamentus, makeGleeok, makeDodongo, makeManhandla,
    makeProjectile, makeBoomerang, makeBomb, makeItem, makeFx,
    overlap, hitbox, tryMove, LINK_INSET, ENEMY_INSET, DIRS,
  };
})();
