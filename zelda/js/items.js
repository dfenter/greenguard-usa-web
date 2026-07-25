/* items.js — item definitions shared by collection, use, HUD, and saves. */

function itemIconBomb(ctx, x, y) {
  ctx.fillStyle = '#202020'; ctx.fillRect(x + 3, y + 2, 9, 9);
  ctx.fillStyle = '#888'; ctx.fillRect(x + 6, y, 3, 3);
}
function itemIconBow(ctx, x, y) {
  ctx.fillStyle = '#d8a020'; ctx.fillRect(x + 4, y, 2, 13);
  ctx.fillStyle = '#fff'; ctx.fillRect(x + 5, y + 5, 7, 2);
}
function itemIconBoomerang(ctx, x, y) {
  ctx.fillStyle = '#d8a020'; ctx.fillRect(x + 2, y + 7, 5, 3);
  ctx.fillRect(x + 2, y + 2, 3, 6); ctx.fillRect(x + 2, y + 2, 8, 3);
}
function itemIconMap(ctx, x, y) {
  ctx.fillStyle='#d8a020'; ctx.fillRect(x+2,y+2,11,10);
  ctx.fillStyle='#fff'; ctx.fillRect(x+4,y+4,2,6); ctx.fillRect(x+8,y+4,2,6);
  ctx.fillStyle='#3858f8'; ctx.fillRect(x+6,y+6,2,2);
}
function itemIconCompass(ctx, x, y) {
  ctx.fillStyle='#f8d030'; ctx.beginPath(); ctx.arc(x+7,y+7,6,0,7); ctx.fill();
  ctx.fillStyle='#d82828'; ctx.fillRect(x+6,y+2,2,5); ctx.fillStyle='#3858f8'; ctx.fillRect(x+6,y+7,2,5);
}
function itemIconWhistle(ctx, x, y) {
  ctx.fillStyle='#58a028'; ctx.fillRect(x+2,y+5,10,6); ctx.fillRect(x+8,y+2,4,5);
  ctx.fillStyle='#d8d8d8'; ctx.fillRect(x+3,y+4,3,2); ctx.fillRect(x+7,y+4,2,2);
}
function itemIconMagicalBoomerang(ctx, x, y) {
  ctx.fillStyle='#f8d030'; ctx.fillRect(x+1,y+6,7,3); ctx.fillRect(x+1,y+1,3,7);
  ctx.fillStyle='#f87800'; ctx.fillRect(x+4,y+1,7,3); ctx.fillRect(x+9,y+3,3,8);
}
function itemIconCandle(ctx, x, y) {
  ctx.fillStyle = '#d82828'; ctx.fillRect(x + 4, y + 5, 6, 8);
  ctx.fillStyle = '#f87800'; ctx.beginPath(); ctx.arc(x + 7, y + 3, 3, 0, 7); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.fillRect(x + 6, y + 5, 2, 2);
}
function itemIconFireRod(ctx, x, y) {
  ctx.fillStyle = '#d82828'; ctx.fillRect(x + 5, y + 2, 4, 11);
  ctx.fillStyle = '#f87800'; ctx.beginPath(); ctx.arc(x + 7, y + 2, 4, 0, 7); ctx.fill();
}
function itemIconSword(ctx, x, y) {
  ctx.fillStyle = '#f8f8f8'; ctx.fillRect(x + 3, y, 3, 13);
  ctx.fillStyle = '#c0c0c0'; ctx.fillRect(x + 4, y, 1, 13);
  ctx.fillStyle = '#f8d030'; ctx.fillRect(x, y + 11, 9, 2);
  ctx.fillStyle = '#a06000'; ctx.fillRect(x + 3, y + 13, 3, 3);
}
function itemIconShield(ctx, x, y) {
  ctx.fillStyle = '#b06818'; ctx.fillRect(x + 2, y, 10, 12);
  ctx.fillStyle = '#f8d030'; ctx.fillRect(x + 5, y + 3, 4, 5);
}
function itemIconMagicShield(ctx, x, y) {
  ctx.fillStyle = '#3858f8'; ctx.fillRect(x + 1, y, 12, 13);
  ctx.fillStyle = '#78c8f8'; ctx.fillRect(x + 4, y + 2, 6, 6);
  ctx.fillStyle = '#f8d030'; ctx.fillRect(x + 5, y + 3, 4, 4);
}
function itemIconPotion(ctx, x, y, color) {
  ctx.fillStyle = '#d8d8d8'; ctx.fillRect(x + 4, y, 6, 3);
  ctx.fillStyle = '#888'; ctx.fillRect(x + 5, y - 1, 4, 2);
  ctx.fillStyle = color; ctx.fillRect(x + 2, y + 4, 10, 9);
  ctx.fillStyle = '#fff'; ctx.fillRect(x + 4, y + 5, 2, 4);
}

function collectTiered(link, state, id, msg) {
  const def = ITEMS[id];
  link.hasSword = true;
  if (def.flag) link[def.flag] = true;
  let best = 0;
  for (const key of Object.keys(ITEMS)) {
    const tier = ITEMS[key].tier;
    if (tier && tier.group === def.tier.group && ITEMS[key].flag && link[ITEMS[key].flag])
      best = Math.max(best, tier.dmg);
  }
  link.swordDmg = Math.max(1, best);
  Sound.SFX.item();
  if (msg) state.showMsg(msg, 200);
}

function cappedAdd(link, field, amount) {
  const cap = field === 'bombs' ? (link.maxBombs || ITEMS.caps.bombs) : ITEMS.caps[field];
  link[field] = Math.min(cap === undefined ? Infinity : cap, Math.max(0, (link[field] || 0) + amount));
}

function collectRupees(link, state, amount, it) {
  const before = link.rupees || 0;
  cappedAdd(link, 'rupees', amount);
  if (state.rupeePopup) state.rupeePopup('+' + (link.rupees - before), it && it.x, it && it.y);
  Sound.SFX.rupee();
}

const SWORD_TIERS = Object.freeze({
  wood: { group:'sword', rank:1, dmg:1 },
  white: { group:'sword', rank:2, dmg:2 },
  magic: { group:'sword', rank:3, dmg:4 },
});

const ITEMS = {
  heart: { slot:'plain', onCollect(link) { link.health = Math.min(link.maxHealth, link.health + 2); Sound.SFX.heart(); } },
  rupee: { slot:'plain', onCollect(link) { cappedAdd(link, 'rupees', 1); Sound.SFX.rupee(); } },
  rupee5: { slot:'plain', onCollect(link) { cappedAdd(link, 'rupees', 5); Sound.SFX.rupee(); } },
  rupee30: { slot:'plain', onCollect(link, state, it) { collectRupees(link, state, 30, it); } },
  rupee100: { slot:'plain', onCollect(link, state, it) { collectRupees(link, state, 100, it); } },
  bomb: { slot:'b', flag:'hasBomb', onCollect(link) { cappedAdd(link, 'bombs', 4); Sound.SFX.rupee(); }, use(link, state) {
    if (link.bombs <= 0) return 'refused';
    const [vx, vy] = DIRS[link.dir]; state.spawn(Entities.makeBomb(link.x + vx * 14, link.y + vy * 14));
    link.bombs--; return 'taken';
  }, icon:itemIconBomb },
  fairy: { slot:'plain', onCollect(link) { link.health = Math.min(link.maxHealth, link.health + 6); Sound.SFX.heart(); } },
  key: { slot:'plain', onCollect(link) { cappedAdd(link, 'keys', 1); Sound.SFX.rupee(); } },
  sword: { slot:'gear', flag:'hasSword', tier:SWORD_TIERS.wood, icon:itemIconSword, onCollect(link, state) {
    collectTiered(link, state, 'sword', 'GOT THE WOODEN SWORD!');
  } },
  bow: { slot:'b', flag:'hasBow', onCollect(link, state) {
    link.hasBow = true; link.bItem = 'bow'; Sound.SFX.item(); state.showMsg('GOT THE BOW! USE RUPEES AS ARROWS.', 200);
  }, use(link, state) {
    if (!link.hasBow || link.rupees <= 0) return 'refused';
    const [vx, vy] = DIRS[link.dir];
    state.spawn(Entities.makeProjectile('arrow', link.x, link.y, link.dir,
      { vx, vy, speed:5, damage:link.hasSilverArrows ? 4 : 2, silver:!!link.hasSilverArrows, fromEnemy:false }));
    link.rupees--; Sound.SFX.beam(); return 'taken';
  }, icon:itemIconBow },
  boomerang: { slot:'b', flag:'hasBoomerang', onCollect(link, state) {
    link.hasBoomerang = true; link.bItem = 'boomerang'; Sound.SFX.item(); state.showMsg('GOT THE BOOMERANG!', 180);
  }, use(link, state) {
    if (!link.hasBoomerang || state.entities.some(e => e.kind === 'proj' && e.ptype === 'boomerang')) return 'refused';
    const [vx, vy] = DIRS[link.dir]; state.spawn(Entities.makeBoomerang(link.x, link.y, vx, vy, link));
    Sound.SFX.sword(); return 'taken';
  }, icon:itemIconBoomerang },
  magicalboomerang: { slot:'b', flag:'hasMagicalBoomerang', onCollect(link, state) {
    link.hasMagicalBoomerang = true; link.bItem = 'magicalboomerang'; Sound.SFX.item(); state.showMsg('GOT THE MAGICAL BOOMERANG!', 200);
  }, use(link, state) {
    if (!link.hasMagicalBoomerang || state.entities.some(e => e.kind === 'proj' && e.ptype === 'boomerang')) return 'refused';
    const [vx, vy] = DIRS[link.dir]; state.spawn(Entities.makeBoomerang(link.x, link.y, vx, vy, link, { magical:true }));
    Sound.SFX.sword(); return 'taken';
  }, icon:itemIconMagicalBoomerang },
  candle: { slot:'b', flag:'hasCandle', onCollect(link, state) {
    link.hasCandle = true; link.bItem = 'candle'; Sound.SFX.item(); state.showMsg('GOT THE BLUE CANDLE!', 180);
  }, use(link, state) {
    if (!link.hasCandle || state.entities.some(e => e.kind === 'proj' && e.ptype === 'flame')) return 'refused';
    const [vx, vy] = DIRS[link.dir]; state.spawn(Entities.makeProjectile('flame', link.x, link.y, link.dir,
      { vx, vy, speed:2.2, damage:1, life:36, fromEnemy:false }));
    Sound.SFX.beam(); return 'taken';
  }, icon:itemIconCandle },
  ring: { slot:'gear', flag:'hasRing', onCollect(link, state) {
    link.hasRing = true; Sound.SFX.item(); state.showMsg('GOT THE BLUE RING! DAMAGE HALVED.', 200);
  } },
  redring: { slot:'gear', flag:'hasRedRing', onCollect(link, state) {
    link.hasRedRing = true; Sound.SFX.item(); state.showMsg('GOT THE RED RING! DAMAGE QUARTERED.', 200);
  } },
  heartcontainer: { slot:'gear', cap:'maxHealth', onCollect(link) { link.maxHealth += 2; link.health = link.maxHealth; Sound.SFX.item(); } },
  whiteword: { slot:'gear', flag:'hasWhiteSword', tier:SWORD_TIERS.white, onCollect(link, state) {
    if (link.maxHealth < 10) { state.showMsg('ONLY THE WORTHY MAY TAKE THIS SWORD.', 200); return 'refused'; }
    collectTiered(link, state, 'whiteword', 'YOU GOT THE WHITE SWORD!');
  } },
  whitesword: { slot:'gear', flag:'hasWhiteSword', tier:SWORD_TIERS.white, icon:itemIconSword, onCollect(link, state) {
    if (link.maxHealth < 10) { state.showMsg('ONLY THE WORTHY MAY TAKE THIS SWORD.', 200); return 'refused'; }
    collectTiered(link, state, 'whitesword', 'YOU GOT THE WHITE SWORD!');
  } },
  magicsword: { slot:'gear', flag:'hasMagicSword', tier:SWORD_TIERS.magic, icon:itemIconSword, onCollect(link, state) {
    if (link.maxHealth < 24) { state.showMsg('ONLY THE WORTHY MAY TAKE THE MAGIC SWORD.', 200); return 'refused'; }
    collectTiered(link, state, 'magicsword', 'YOU GOT THE MAGIC SWORD!');
  } },
  stepladder: { slot:'gear', flag:'hasStepladder', onCollect(link, state) {
    link.hasStepladder = true; Sound.SFX.item(); state.showMsg('GOT THE STEPLADDER!', 180);
  } },
  raft: { slot:'gear', flag:'hasRaft', onCollect(link, state) {
    link.hasRaft = true; Sound.SFX.item(); state.showMsg('GOT THE RAFT!', 180);
  } },
  powerbracelet: { slot:'gear', flag:'hasPowerBracelet', onCollect(link, state) {
    link.hasPowerBracelet = true; Sound.SFX.item(); state.showMsg('GOT THE POWER BRACELET!', 180);
  } },
  magickey: { slot:'gear', flag:'hasMagicKey', onCollect(link, state) {
    link.hasMagicKey = true; Sound.SFX.item(); state.showMsg('GOT THE MAGIC KEY!', 180);
  } },
  map: { slot:'gear', icon:itemIconMap, onCollect(link, state, it) {
    link.hasMap = true; Sound.SFX.item(); state.showMsg('GOT THE DUNGEON MAP!', 180);
  } },
  compass: { slot:'gear', icon:itemIconCompass, onCollect(link, state, it) {
    link.hasCompass = true; Sound.SFX.item(); state.showMsg('GOT THE COMPASS!', 180);
  } },
  whistle: { slot:'b', flag:'hasWhistle', icon:itemIconWhistle, onCollect(link, state) {
    link.hasWhistle = true; link.bItem = 'whistle'; Sound.SFX.item(); state.showMsg('GOT THE WHISTLE!', 180);
  }, use(link, state) {
    if (!link.hasWhistle) return 'refused';
    Sound.SFX.whistle();
    if (state.mode === 'dungeon') {
      const boss = state.entities.find(e => e.etype === 'digdogger' && e.alive !== false);
      if (boss && boss.shrink) boss.shrink(state);
      return 'taken';
    }
    if (state.mode !== 'overworld') return 'taken';
    if (state.onWhistle && state.onWhistle()) return 'taken';
    if (state.warpToVisitedDungeon) state.warpToVisitedDungeon();
    return 'taken';
  } },
  silverarrows: { slot:'gear', flag:'hasSilverArrows', onCollect(link, state) {
    link.hasSilverArrows = true; Sound.SFX.item(); state.showMsg('GOT THE SILVER ARROWS!', 180);
  } },
  zelda: { slot:'plain', onCollect(link, state) {
    if (state.quest.phase !== 'ganonDefeated') return 'refused';
    state.quest.phase = 'rescued';
    state.counters.questComplete = true;
    state.counters.ngMarker = true;
    if (state.saveGame) state.saveGame();
    Sound.SFX.secret(); Sound.stopMusic();
    state.mode = 'ending'; state.flashEnding = 0;
  } },
  firerod: { slot:'b', flag:'hasFireRod', onCollect(link, state) {
    link.hasFireRod = true; link.bItem = 'firerod'; Sound.SFX.item(); state.showMsg('GOT THE FIRE ROD!', 180);
  }, use(link, state) {
    if (!link.hasFireRod || link.rupees < 4) return 'refused';
    const [vx, vy] = DIRS[link.dir];
    const p = Entities.makeProjectile('fireblast', link.x, link.y, link.dir,
      { vx, vy, speed:2.5, damage:2, life:48, fromEnemy:false });
    p.w = 20; p.h = 20; state.spawn(p); link.rupees -= 4; Sound.SFX.beam(); return 'taken';
  }, icon:itemIconFireRod },
  shield: { slot:'gear', flag:'hasShield', icon:itemIconShield },
  magicshield: { slot:'gear', flag:'hasMagicShield', icon:itemIconMagicShield, onCollect(link, state) {
    link.hasMagicShield = true; Sound.SFX.item(); state.showMsg('GOT THE MAGICAL SHIELD!', 180);
  } },
  bait: { slot:'gear', flag:'hasBait', onCollect(link, state) {
    link.hasBait = true; Sound.SFX.item(); state.showMsg('GOT THE BAIT!', 160);
  } },
  letter: { slot:'gear', flag:'hasLetter', onCollect(link, state) {
    link.hasLetter = true; Sound.SFX.item(); state.showMsg('GOT THE LETTER!', 160);
  } },
  potion: { slot:'b', flag:'hasPotion', saveFields:['potion','potionCharges'], onCollect(link, state, it) {
    link.hasPotion = true;
    link.potion = it.item === 'redpotion' ? 'red' : 'blue';
    link.potionCharges = link.potion === 'red' ? 2 : 1;
    link.bItem = 'potion';
    Sound.SFX.item(); state.showMsg(link.potion === 'red' ? 'GOT THE RED POTION!' : 'GOT THE BLUE POTION!', 180);
  }, use(link, state) {
    if (!link.hasPotion || link.potionCharges <= 0) return 'refused';
    link.health = link.maxHealth;
    link.potionCharges--;
    if (link.potion === 'red' && link.potionCharges === 1) link.potion = 'blue';
    if (link.potionCharges <= 0) {
      link.hasPotion = false; link.potion = null;
      if (link.bItem === 'potion') link.bItem = 'bomb';
    }
    Sound.SFX.heart(); state.showMsg('YOUR LIFE IS RESTORED!', 120); return 'taken';
  } },
  bluepotion: { slot:'plain', onCollect(link, state, it) { return ITEMS.potion.onCollect(link, state, it); } },
  redpotion: { slot:'plain', onCollect(link, state, it) { return ITEMS.potion.onCollect(link, state, it); } },
  bombupgrade: { slot:'gear', flag:'hasBombUpgrade', saveFields:['maxBombs'], onCollect(link, state) {
    link.maxBombs = Math.min(16, (link.maxBombs || 8) + 4);
    link.hasBombUpgrade = true; Sound.SFX.item(); state.showMsg('YOUR BOMB BAG GROWS!', 180);
  } },
  triforce: { slot:'plain', onCollect(link, state, it) {
    link.triforce = true; state.triforces++; state.quest.triforces = state.triforces; Sound.SFX.secret();
    if (it._unique) state.taken.add(it._unique);
    if (state.triforces >= state.TRIFORCE_PIECES) {
      state.quest.phase = 'level9Open';
      state.quest.triforces = state.triforces;
      if (state.saveGame) state.saveGame();
      state._warpOut = true;
      state.showMsg("GO TO DEATH MOUNTAIN. DESTROY GANON!", 240);
    }
    else { state.showMsg('A TRIFORCE PIECE! (' + state.triforces + ' OF ' + state.TRIFORCE_PIECES + ')', 220); state._warpOut = true; }
  } },
};

// Centralized progression limits used by pickup, save migration, and HUD.
ITEMS.caps = Object.freeze({ rupees:255, keys:9, bombs:8 });
ITEMS.swordTiers = SWORD_TIERS;
