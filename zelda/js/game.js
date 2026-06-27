/* game.js — state machine, screen/room management, HUD, caves, combat glue. */

const Game = (() => {
  const E = Entities;
  // `dbg` is an optional on-screen debug logger defined by index.html. Fall back
  // to a no-op so the game boots in any host (tests, embeds) that lacks it.
  const dbg = (typeof window !== 'undefined' && window.dbg) ? window.dbg : function(){};

  const state = {
    mode: 'title',        // title | overworld | dungeon | cave | scroll | gameover | win
    prevMode: 'overworld',
    col: 0, row: 0,
    level: null,
    grid: null, theme: 'over',
    screenImg: null,
    entities: [],
    link: null,
    swordSwung: 0,
    swordHit: false,
    keys: Engine.keys, pressed: Engine.pressed,
    rand: Engine.rand, randInt: Engine.randInt, choice: Engine.choice,
    cleared: new Set(),       // screens/rooms fully cleared
    taken: new Set(),         // unique items collected (bow, boomerang, triforce...)
    cave: null,
    scroll: null,
    msg: null, msgT: 0,
    flashWin: 0,
    triforces: 0,
  };

  // expose mutable input each frame
  Object.defineProperty(state, 'keys', { get: () => Engine.keys });
  Object.defineProperty(state, 'pressed', { get: () => Engine.pressed });

  // ---------- helpers ----------
  function key3(prefix, c, r) { return prefix + ':' + c + ',' + r; }

  function bakeScreen(grid, theme) {
    const c = document.createElement('canvas');
    c.width = PLAY_W; c.height = PLAY_H;
    const x = c.getContext('2d');
    x.fillStyle = '#000'; x.fillRect(0, 0, PLAY_W, PLAY_H);
    for (let r = 0; r < ROWS; r++) {
      for (let col = 0; col < COLS; col++) {
        const ch = grid[r][col];
        Tiles.blit(x, theme, ch, col * 16, r * 16);
      }
    }
    return c;
  }

  function solidAt(px, py) {
    const c = Math.floor(px / 16), r = Math.floor(py / 16);
    if (c < 0 || c > 15 || r < 0 || r > 10) return false;   // off-edge = walk-through (triggers transition)
    const ch = state.grid[r][c];
    if (ch === 'W' && state.link && state.link.hasStepladder) return false;
    return Tiles.isSolid(ch);
  }

  function tileAtPx(px, py) {
    const c = Math.floor(px / 16), r = Math.floor(py / 16);
    if (c < 0 || c > 15 || r < 0 || r > 10) return null;
    return { c, r, ch: state.grid[r][c] };
  }

  // ---------- loading screens ----------
  function loadOverworld(col, row, entryPos) {
    const sc = World.get(col, row);
    if (!sc) return false;
    state.mode = 'overworld';
    state.col = col; state.row = row;
    state.theme = sc.theme;
    state.grid = sc.rows.map(s => s.split('').slice(0, 16).join(''));
    state.screenImg = bakeScreen(state.grid, state.theme);
    state.entities = [];
    // enemies (unless cleared)
    if (!state.cleared.has(key3('ow', col, row)) && sc.enemies) {
      for (const [t, v, tx, ty] of sc.enemies) spawnEnemy(t, v, tx, ty);
    }
    if (entryPos) { state.link.x = entryPos[0]; state.link.y = entryPos[1]; }
    return true;
  }

  function loadDungeonRoom(col, row, entryPos) {
    const lvl = state.level;
    const rd = Dungeon.getRoom(lvl, col, row);
    if (!rd) return false;
    state.mode = 'dungeon';
    state.col = col; state.row = row;
    state.theme = rd.room.theme;
    state.grid = rd.room.rows.map(s => s.split(''));
    // re-lock doors are part of grid already; unlocked persist via cleared overrides
    applyDoorState(lvl, col, row);
    state.screenImg = bakeScreen(state.grid, state.theme);
    state.entities = [];
    const cleared = state.cleared.has(key3('d' + lvl.id, col, row));
    if (!cleared && rd.enemies) for (const [t, v, tx, ty] of rd.enemies) spawnEnemy(t, v, tx, ty);
    if (rd.boss && !state.taken.has(key3('boss' + lvl.id, col, row))) {
      if (rd.boss.variant === 'gleeok') {
        state.entities.push(E.makeGleeok(rd.boss.x, rd.boss.y, rd.boss.bossOpts || {}));
      } else {
        state.entities.push(E.makeAquamentus(rd.boss.x, rd.boss.y, { variant: rd.boss.variant }));
      }
    }
    if (rd.item && !state.taken.has(key3('item' + lvl.id, col, row))) {
      const it = E.makeItem(rd.item.kind, rd.item.x * 16, rd.item.y * 16, { permanent: true });
      it._unique = key3('item' + lvl.id, col, row);
      state.entities.push(it);
    }
    if (rd.triforce && state.taken.has(key3('boss' + lvl.id, col, row)) && !state.taken.has('triforce' + lvl.id)) {
      const it = E.makeItem('triforce', rd.triforce.x * 16, rd.triforce.y * 16, { permanent: true });
      it._unique = 'triforce' + lvl.id;
      state.entities.push(it);
    }
    if (entryPos) { state.link.x = entryPos[0]; state.link.y = entryPos[1]; }
    return true;
  }

  // unlocked doors persist
  const unlocked = new Set();
  function applyDoorState(lvl, col, row) {
    // convert any 'L' to 'F' if previously unlocked from this room/side
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++)
        if (state.grid[r][c] === 'L' && unlocked.has(lvl.id + ':' + col + ',' + row + ':' + c + ',' + r))
          state.grid[r][c] = 'F';
  }

  function spawnEnemy(t, v, tx, ty) {
    state.entities.push(E.makeEnemy(t, v, tx, ty));
  }

  function countEnemies() { return state.entities.filter(e => e.kind === 'enemy' && e.alive !== false).length; }

  // ---------- transitions ----------
  function startScroll(dir, ncol, nrow, loader) {
    const fromImg = state.screenImg;
    // pre-load target into a temp by swapping grid; bake; then restore for animation
    const savedGrid = state.grid, savedImg = state.screenImg, savedTheme = state.theme,
          savedCol = state.col, savedRow = state.row, savedEnts = state.entities;
    loader();   // mutates state to new screen (entities for new screen created but we hold them)
    const toImg = state.screenImg;
    const newEnts = state.entities;
    const newCol = state.col, newRow = state.row, newGrid = state.grid, newTheme = state.theme;
    // restore old for animation
    state.grid = savedGrid; state.screenImg = savedImg; state.theme = savedTheme;
    state.col = savedCol; state.row = savedRow;

    const link = state.link;
    const linkFrom = { x: link.x, y: link.y };
    const linkTo = { x: link.x, y: link.y };
    if (dir === 'left')  { linkTo.x = PLAY_W - 18; }
    if (dir === 'right') { linkTo.x = 2; }
    if (dir === 'up')    { linkTo.y = PLAY_H - 18; }
    if (dir === 'down')  { linkTo.y = 2; }

    state.scroll = {
      dir, t: 0, max: 28, fromImg, toImg, linkFrom, linkTo,
      finalize() {
        state.col = newCol; state.row = newRow; state.grid = newGrid;
        state.theme = newTheme; state.screenImg = toImg; state.entities = newEnts;
        state.mode = (World.get(newCol, newRow) && state.level == null) ? 'overworld' : state.mode;
        link.x = linkTo.x; link.y = linkTo.y; link.knock = null;
      }
    };
    state.prevMode = state.mode;
    state.mode = 'scroll';
  }

  function checkEdge() {
    const link = state.link;
    let dir = null;
    if (link.x < -2) dir = 'left';
    else if (link.x > PLAY_W - 14) dir = 'right';
    else if (link.y < -2) dir = 'up';
    else if (link.y > PLAY_H - 14) dir = 'down';
    if (!dir) return;

    if (state.mode === 'overworld') {
      const d = E.DIRS[dir];
      const nc = state.col + d[0], nr = state.row + d[1];
      if (World.get(nc, nr)) startScroll(dir, nc, nr, () => loadOverworld(nc, nr));
      else clampLink();
    } else if (state.mode === 'dungeon') {
      const rd = Dungeon.getRoom(state.level, state.col, state.row);
      // bottom door of entrance room -> exit to overworld
      if (dir === 'down' && rd && rd.exit && rd.exit.down) { exitDungeon(); return; }
      const d = E.DIRS[dir];
      const nc = state.col + d[0], nr = state.row + d[1];
      if (Dungeon.getRoom(state.level, nc, nr)) startScroll(dir, nc, nr, () => loadDungeonRoom(nc, nr));
      else clampLink();
    } else if (state.mode === 'cave') {
      if (dir === 'down') exitCave();
      else clampLink();
    }
  }
  function clampLink() {
    const l = state.link;
    l.x = Math.max(0, Math.min(PLAY_W - 16, l.x));
    l.y = Math.max(0, Math.min(PLAY_H - 16, l.y));
  }

  // find an open (non-solid) tile at-or-below a column, return pixel pos
  function freeBelow(col, row) {
    for (let r = row; r <= 9; r++) {
      if (!Tiles.isSolid(state.grid[r][col])) return [col * 16, r * 16];
    }
    // fall back: scan whole interior
    for (let r = 9; r >= 1; r--)
      for (let c = 1; c <= 14; c++)
        if (!Tiles.isSolid(state.grid[r][c])) return [c * 16, r * 16];
    return [7 * 16, 8 * 16];
  }

  // ---------- caves / dungeons entry ----------
  function enterCave(kind, tile) {
    // exit onto the open tile just below the cave entrance (never into a wall)
    const exitPos = tile ? freeBelow(tile.c, tile.r + 1) : [state.link.x, PLAY_H - 28];
    state.cave = {
      kind,
      ret: { col: state.col, row: state.row, pos: exitPos },
    };
    // build cave grid: walls + bottom exit
    const g = [];
    for (let r = 0; r < ROWS; r++) {
      let row = '';
      for (let c = 0; c < COLS; c++) {
        let ch = (r === 0 || r === 10 || c === 0 || c === 15) ? '#' : 'F';
        if (r === 10 && (c === 7 || c === 8)) ch = 'F';   // exit gap
        row += ch;
      }
      g.push(row);
    }
    state.grid = g.map(s => s.split(''));
    state.theme = 'dungeon';
    state.screenImg = bakeScreen(state.grid, state.theme);
    state.entities = [];
    state.mode = 'cave';
    state.link.x = 7 * 16; state.link.y = PLAY_H - 20;

    const give = (k, ux, msg) => {
      const uniq = 'cave-' + state.col + ',' + state.row + '-' + k;
      if (!state.taken.has(uniq)) {
        const it = E.makeItem(k, ux * 16, 4 * 16, { permanent: true });
        it._unique = uniq;
        state.entities.push(it);
      }
      if (msg) showMsg(msg, 99999);
    };
    if (kind === 'sword') {
      if (!state.link.hasSword) {
        const it = E.makeItem('sword', 7 * 16 + 4, 4 * 16, { permanent: true });
        it.draw = (ctx, ox, oy) => drawSwordItem(it, ctx, ox, oy);
        it._sword = true;
        state.entities.push(it);
        showMsg("IT'S DANGEROUS TO GO ALONE! TAKE THIS.", 99999);
      } else {
        showMsg('MASTER USING IT AND YOU CAN HAVE THIS.', 240);
      }
    } else if (kind === 'candle') {
      if (state.link.hasCandle) showMsg('COME BACK ANY TIME.', 200);
      else give('candle', 7, 'TAKE THE CANDLE. LIGHT THE DARK!');
    } else if (kind === 'ring') {
      if (state.link.hasRing) showMsg('IT SUITS YOU WELL.', 200);
      else give('ring', 7, 'THE BLUE RING. IT EASES YOUR PAIN.');
    } else if (kind === 'fairy') {
      state.link.health = state.link.maxHealth;
      state.entities.push(E.makeItem('fairy', 7 * 16, 4 * 16, { permanent: true }));
      showMsg('A FAIRY RESTORES YOUR LIFE.', 180);
      Sound.SFX.heart();
    } else if (kind === 'whitesword') {
      if (state.link.hasWhiteSword) { showMsg('YOU ALREADY HAVE THE WHITE SWORD.', 200); }
      else { give('whitesword', 7, "YOU GOT THE WHITE SWORD!"); }
    } else if (kind === 'magicsword') {
      if (state.link.hasMagicSword) { showMsg('YOU ALREADY HAVE THE MAGIC SWORD.', 200); }
      else if (state.link.maxHealth >= 10) { give('magicsword', 7, 'YOU GOT THE MAGIC SWORD!'); }
      else { showMsg('ONLY THE WORTHY MAY TAKE THIS SWORD.', 200); }
    } else if (kind === 'firerod') {
      if (state.link.hasFireRod) { showMsg('YOU ALREADY HAVE THE FIRE ROD.', 200); }
      else { give('firerod', 7, 'YOU GOT THE FIRE ROD!'); }
    } else if (kind === 'raft') {
      if (state.link.hasRaft) { showMsg('THE RAFT IS YOURS ALREADY.', 200); }
      else { give('raft', 7, 'TAKE THE RAFT. CROSS THE WATERS TO LEVEL 6!'); }
    } else if (kind === 'heartpiece') {
      const uniq = 'cave-' + state.col + ',' + state.row + '-heartcontainer';
      if (state.taken.has(uniq)) { showMsg('THE ALTAR IS EMPTY NOW.', 200); }
      else { give('heartcontainer', 7, 'A HEART CONTAINER! YOUR LIFE GROWS.'); }
    } else { // 'money' and legacy 'shop'
      state.entities.push(E.makeItem('rupee', 5 * 16, 5 * 16, { life: 0 }));
      state.entities.push(E.makeItem('rupee', 7 * 16, 4 * 16, { life: 0 }));
      state.entities.push(E.makeItem('rupee', 9 * 16, 5 * 16, { life: 0 }));
      showMsg('TAKE ANY ROAD YOU WANT.', 99999);
    }
  }
  function exitCave() {
    const ret = state.cave.ret; state.cave = null; state.msg = null;
    loadOverworld(ret.col, ret.row, ret.pos);
    state.link.dir = 'down';
  }

  function enterDungeon(level, tile) {
    if (level === 6 && !state.link.hasRaft) {
      showMsg('YOU NEED THE RAFT TO CROSS.', 180); return;
    }
    state.level = Dungeon.level(level);
    state.prevReturn = { col: state.col, row: state.row, tile: tile ? { c: tile.c, r: tile.r } : null };
    Sound.SFX.stairs();
    const en = state.level.entry;
    loadDungeonRoom(en.col, en.row, [en.pos[0] * 16, en.pos[1] * 16]);
  }
  function exitDungeon() {
    const ret = state.prevReturn || { col: 1, row: 0, tile: null };
    state.level = null;
    Sound.SFX.stairs();
    loadOverworld(ret.col, ret.row, null);
    // place Link on the open tile just below the dungeon entrance
    const pos = ret.tile ? freeBelow(ret.tile.c, ret.tile.r + 1) : [7 * 16, 8 * 16];
    state.link.x = pos[0]; state.link.y = pos[1]; state.link.dir = 'down';
  }

  // ---------- messages ----------
  function showMsg(text, frames) { state.msg = text; state.msgT = frames; Sound.SFX.text(); }

  // ---------- callbacks from entities ----------
  state.solidAt = solidAt;
  state.spawn = (e) => state.entities.push(e);
  state.collect = (it) => collect(it);
  state.onEnemyKilled = (e) => onEnemyKilled(e);
  state.onBossKilled = (e) => onBossKilled(e);
  state.onLinkDead = () => { state.mode = 'gameover'; state.msgT = 180; Sound.SFX.die(); Sound.stopMusic(); };

  function collect(it) {
    const l = state.link;
    switch (it.item) {
      case 'heart': l.health = Math.min(l.maxHealth, l.health + 2); Sound.SFX.heart(); break;
      case 'rupee': l.rupees += 1; Sound.SFX.rupee(); break;
      case 'bomb':  l.bombs += 4; Sound.SFX.rupee(); break;
      case 'fairy': l.health = Math.min(l.maxHealth, l.health + 6); Sound.SFX.heart(); break;
      case 'key':   l.keys += 1; Sound.SFX.rupee(); break;
      case 'sword': l.hasSword = true; Sound.SFX.item(); showMsg('GOT THE WOODEN SWORD!', 180); break;
      case 'bow':   l.hasBow = true; l.bItem = 'bow'; Sound.SFX.item(); showMsg('GOT THE BOW! USE RUPEES AS ARROWS.', 200); break;
      case 'boomerang': l.hasBoomerang = true; l.bItem = 'boomerang'; Sound.SFX.item(); showMsg('GOT THE BOOMERANG!', 180); break;
      case 'candle': l.hasCandle = true; l.bItem = 'candle'; Sound.SFX.item(); showMsg('GOT THE BLUE CANDLE!', 180); break;
      case 'ring': l.hasRing = true; Sound.SFX.item(); showMsg('GOT THE BLUE RING! DAMAGE HALVED.', 200); break;
      case 'heartcontainer': l.maxHealth += 2; l.health = l.maxHealth; Sound.SFX.item(); break;
      case 'whiteword':
      case 'whitesword':
        l.hasWhiteSword = true; l.swordDmg = 2; Sound.SFX.item();
        showMsg('YOU GOT THE WHITE SWORD!', 200); break;
      case 'magicsword':
        if (l.maxHealth >= 10) {
          l.hasMagicSword = true; l.swordDmg = 3; Sound.SFX.item();
          showMsg('YOU GOT THE MAGIC SWORD!', 200);
        } else {
          showMsg('ONLY THE WORTHY MAY TAKE THE MAGIC SWORD.', 200);
          // Return the item to world (don't consume it)
          it.alive = true; state.entities.push(it); return;
        }
        break;
      case 'stepladder':
        l.hasStepladder = true; Sound.SFX.item(); showMsg('GOT THE STEPLADDER!', 180); break;
      case 'raft':
        l.hasRaft = true; Sound.SFX.item(); showMsg('GOT THE RAFT!', 180); break;
      case 'magickey':
        l.hasMagicKey = true; Sound.SFX.item(); showMsg('GOT THE MAGIC KEY!', 180); break;
      case 'silverarrows':
        l.hasSilverArrows = true; Sound.SFX.item(); showMsg('GOT THE SILVER ARROWS!', 180); break;
      case 'firerod':
        l.hasFireRod = true; l.bItem = 'firerod'; Sound.SFX.item(); showMsg('GOT THE FIRE ROD!', 180); break;
      case 'triforce':
        l.triforce = true; state.triforces++;
        Sound.SFX.secret();
        if (it._unique) state.taken.add(it._unique);
        if (state.triforces >= Dungeon.count) { state.mode = 'win'; state.flashWin = 0; Sound.stopMusic(); }
        else { showMsg('A TRIFORCE PIECE! (' + state.triforces + ' OF ' + Dungeon.count + ')', 220); state._warpOut = true; }
        return;
    }
    if (it._unique) state.taken.add(it._unique);
  }

  function onEnemyKilled(e) {
    // drop?
    if (!e.boss && state.rand() < 0.55) {
      const roll = state.rand();
      let kind = 'heart';
      if (roll < 0.35) kind = 'heart';
      else if (roll < 0.7) kind = 'rupee';
      else if (roll < 0.88) kind = 'bomb';
      else kind = 'fairy';
      const it = E.makeItem(kind, e.x + 1, e.y + 1, { life: 380 });
      state.entities.push(it);
    }
    // screen clear bookkeeping (defer to update)
  }
  function onBossKilled(e) {
    const lvl = state.level;
    state.taken.add(key3('boss' + lvl.id, state.col, state.row));
    Sound.SFX.secret();
    // drop heart container, then triforce appears
    state.entities.push(E.makeItem('heartcontainer', 4 * 16, 5 * 16, { permanent: true }));
    const rd = Dungeon.getRoom(lvl, state.col, state.row);
    if (rd.triforce) {
      const it = E.makeItem('triforce', rd.triforce.x * 16, rd.triforce.y * 16, { permanent: true });
      it._unique = 'triforce' + lvl.id;
      state.entities.push(it);
    }
  }

  // ---------- sword melee ----------
  function swordRect() {
    const l = state.link;
    switch (l.dir) {
      case 'right': return { x: l.x + 11, y: l.y + 5, w: 15, h: 7 };
      case 'left':  return { x: l.x - 10, y: l.y + 5, w: 15, h: 7 };
      case 'up':    return { x: l.x + 5, y: l.y - 10, w: 7, h: 15 };
      case 'down':  return { x: l.x + 5, y: l.y + 11, w: 7, h: 15 };
    }
  }
  function doSwordHits() {
    if (state.swordSwung <= 0) return;
    const sr = swordRect();
    for (const en of state.entities) {
      if (en.kind === 'enemy' && en.alive !== false && E.overlap(sr, E.hitbox(en))) {
        en.hurt(state, state.link.swordDmg || 1, state.link.x + 8, state.link.y + 8);
      }
    }
  }

  // ---------- unlock locked doors ----------
  function tryUnlock() {
    const l = state.link;
    if (l.keys <= 0 && !l.hasMagicKey) return;
    const cx = l.x + 8, cy = l.y + 8;
    let fx = cx, fy = cy;
    if (l.dir === 'left') fx = l.x - 2; if (l.dir === 'right') fx = l.x + 18;
    if (l.dir === 'up') fy = l.y - 2; if (l.dir === 'down') fy = l.y + 18;
    const t = tileAtPx(fx, fy);
    if (t && t.ch === 'L') {
      state.grid[t.r][t.c] = 'F';
      unlocked.add(state.level.id + ':' + state.col + ',' + state.row + ':' + t.c + ',' + t.r);
      state.screenImg = bakeScreen(state.grid, state.theme);
      if (!l.hasMagicKey) l.keys--;
      Sound.SFX.secret();
    }
  }

  // ---------- update ----------
  function update() {
    const P = Engine.pressed;
    if (P.mute) { const m = Sound.toggleMute(); state.muteFlash = 60; }

    if (state.mode === 'title') {
      if (P.start || P.a) { Sound.ensure(); Sound.startMusic(); startGame(); }
      return;
    }
    if (state.mode === 'gameover') {
      if (P.start || P.a) startGame();
      if (state.msgT > 0) state.msgT--;
      return;
    }
    if (state.mode === 'win') {
      state.flashWin++;
      if ((P.start || P.a) && state.flashWin > 120) startGame();
      return;
    }
    if (state.mode === 'scroll') {
      const s = state.scroll;
      s.t++;
      if (s.t >= s.max) { s.finalize(); state.mode = state.prevMode === 'dungeon' ? 'dungeon' : (state.level ? 'dungeon' : 'overworld'); state.scroll = null; }
      return;
    }

    // playing modes: overworld / dungeon / cave
    // B-item cycle
    if (P.select) cycleItem();

    state.link.update(state);
    state.swordSwung = Math.max(0, state.swordSwung - 1);
    doSwordHits();
    if (state.mode === 'dungeon') tryUnlock();

    // update entities
    for (const e of state.entities) if (e.update) e.update(state);

    // deferred dungeon exit after collecting a non-final Triforce piece
    if (state._warpOut) { state._warpOut = false; exitDungeon(); return; }

    // remove dead
    const before = countEnemies();
    state.entities = state.entities.filter(e => e.alive !== false);
    const after = countEnemies();

    // mark cleared
    if (before > 0 && after === 0 && (state.mode === 'overworld' || state.mode === 'dungeon')) {
      if (state.mode === 'overworld') state.cleared.add(key3('ow', state.col, state.row));
      else state.cleared.add(key3('d' + state.level.id, state.col, state.row));
    }

    // triggers (cave/dungeon entrances)
    if (state.mode === 'overworld') {
      const t = tileAtPx(state.link.x + 8, state.link.y + 10);
      if (t) {
        const sc = World.get(state.col, state.row);
        if (t.ch === 'C' && sc.cave) enterCave(sc.cave.kind, t);
        else if (t.ch === 'S' && sc.cave) enterCave(sc.cave.kind || 'shop', t);
        else if (t.ch === 'D' && sc.dungeon) enterDungeon(sc.dungeon.level, t);
      }
    }

    checkEdge();
    if (state.msgT > 0 && state.msgT < 99999) state.msgT--;
  }

  function cycleItem() {
    const l = state.link;
    const owned = ['bomb'];
    if (l.hasBow) owned.push('bow');
    if (l.hasBoomerang) owned.push('boomerang');
    if (l.hasCandle) owned.push('candle');
    if (l.hasFireRod) owned.push('firerod');
    const i = owned.indexOf(l.bItem);
    l.bItem = owned[(i + 1) % owned.length];
    Sound.SFX.select();
  }

  function startGame() {
    // reset link + world
    const st = World.findStart();
    state.link = E.makeLink(st.screen.startPos[0] * 16, st.screen.startPos[1] * 16);
    state.cleared = new Set(); state.taken = new Set(); unlocked.clear();
    state.level = null; state.cave = null; state.scroll = null;
    state.msg = null; state.msgT = 0; state.triforces = 0;
    loadOverworld(st.col, st.row, [st.screen.startPos[0] * 16, st.screen.startPos[1] * 16]);
    state.mode = 'overworld';
    if (!Sound.isMuted()) Sound.startMusic();
  }

  // ---------- rendering ----------
  function render(ctx) {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);

    if (state.mode === 'title') { drawTitle(ctx); return; }
    if (state.mode === 'win') { drawWin(ctx); return; }

    drawHUD(ctx);

    ctx.save();
    ctx.translate(0, HUD_H);
    // play viewport
    ctx.beginPath(); ctx.rect(0, 0, PLAY_W, PLAY_H); ctx.clip();

    if (state.mode === 'scroll') {
      drawScroll(ctx);
    } else {
      ctx.drawImage(state.screenImg, 0, 0);
      // entities sorted so pickups/under first
      for (const e of state.entities) if (e.item) e.draw(ctx, 0, 0);
      for (const e of state.entities) if (e.kind === 'enemy') e.draw(ctx, 0, 0);
      for (const e of state.entities) if (e.kind === 'proj') e.draw(ctx, 0, 0);
      drawSword(ctx);
      state.link.draw(ctx, 0, 0);
      if (state.mode === 'cave') drawOldMan(ctx);
    }
    ctx.restore();

    if (state.mode === 'gameover') drawGameOver(ctx);
    if (state.msg && state.msgT > 0) drawMessage(ctx);
    if (state.muteFlash > 0) { state.muteFlash--; Engine.text(ctx, Sound.isMuted() ? 'MUTED' : 'SOUND ON', 96, 2, '#fff'); }
  }

  function drawScroll(ctx) {
    const s = state.scroll;
    const p = s.t / s.max;
    let ox = 0, oy = 0;
    if (s.dir === 'left')  { ox = p * PLAY_W; }
    if (s.dir === 'right') { ox = -p * PLAY_W; }
    if (s.dir === 'up')    { oy = p * PLAY_H; }
    if (s.dir === 'down')  { oy = -p * PLAY_H; }
    ctx.drawImage(s.fromImg, ox, oy);
    if (s.dir === 'left')  ctx.drawImage(s.toImg, ox - PLAY_W, oy);
    if (s.dir === 'right') ctx.drawImage(s.toImg, ox + PLAY_W, oy);
    if (s.dir === 'up')    ctx.drawImage(s.toImg, ox, oy - PLAY_H);
    if (s.dir === 'down')  ctx.drawImage(s.toImg, ox, oy + PLAY_H);
    // link lerps
    const lx = s.linkFrom.x + (s.linkTo.x - s.linkFrom.x) * p;
    const ly = s.linkFrom.y + (s.linkTo.y - s.linkFrom.y) * p;
    const save = { x: state.link.x, y: state.link.y };
    state.link.x = lx; state.link.y = ly;
    state.link.draw(ctx, 0, 0);
    state.link.x = save.x; state.link.y = save.y;
  }

  function drawSword(ctx) {
    if (state.swordSwung <= 0 || !state.link.hasSword) return;
    const r = swordRect(); const l = state.link;
    ctx.fillStyle = '#e8e8e8'; ctx.fillStyle = '#d0d0f8';
    // blade
    ctx.fillStyle = '#f8f8f8';
    if (l.dir === 'left' || l.dir === 'right') ctx.fillRect(r.x, r.y + 1, r.w, 4);
    else ctx.fillRect(r.x + 1, r.y, 4, r.h);
    // hilt
    ctx.fillStyle = '#f8d030';
    if (l.dir === 'right') ctx.fillRect(r.x - 2, r.y, 3, 7);
    if (l.dir === 'left') ctx.fillRect(r.x + r.w - 1, r.y, 3, 7);
    if (l.dir === 'down') ctx.fillRect(r.x, r.y - 2, 7, 3);
    if (l.dir === 'up') ctx.fillRect(r.x, r.y + r.h - 1, 7, 3);
  }

  function drawSwordItem(it, ctx, ox, oy) {
    const x = (it.x | 0) + ox, y = (it.y | 0) + oy;
    ctx.fillStyle = '#f8f8f8'; ctx.fillRect(x + 3, y, 3, 13);
    ctx.fillStyle = '#c0c0c0'; ctx.fillRect(x + 4, y, 1, 13);
    ctx.fillStyle = '#f8d030'; ctx.fillRect(x, y + 11, 9, 2);
    ctx.fillStyle = '#a06000'; ctx.fillRect(x + 3, y + 13, 3, 3);
  }

  function drawOldMan(ctx) {
    Sprites.blit(ctx, Sprites.get('oldman'), 7 * 16, 1 * 16);
  }

  // ---------- HUD ----------
  function drawHUD(ctx) {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, SCREEN_W, HUD_H);
    const l = state.link;

    // minimap (left)
    drawMiniMap(ctx, 8, 8);

    // level/area label + triforce tally
    if (state.mode === 'dungeon') Engine.text(ctx, 'LEVEL-' + state.level.id, 8, 44, '#fff');
    else {
      for (let i = 0; i < Dungeon.count; i++) {
        const tx = 8 + i * 12, got = i < state.triforces;
        ctx.fillStyle = got ? '#f8d030' : '#3a3000';
        ctx.fillRect(tx + 4, 44, 1, 1); ctx.fillRect(tx + 3, 45, 3, 1);
        ctx.fillRect(tx + 2, 46, 5, 1); ctx.fillRect(tx + 1, 47, 7, 1); ctx.fillRect(tx, 48, 9, 1);
      }
    }

    // item boxes (center)
    const bx = 120;
    ctx.fillStyle = '#444'; ctx.fillRect(bx, 18, 40, 32);
    Engine.text(ctx, 'B', bx + 2, 8, '#fff');
    Engine.text(ctx, 'A', bx + 26, 8, '#fff');
    ctx.fillStyle = '#000'; ctx.fillRect(bx + 2, 20, 16, 28); ctx.fillRect(bx + 22, 20, 16, 28);
    drawBIcon(ctx, l.bItem, bx + 3, 26);
    if (l.hasSword) drawSwordItem({ x: bx + 27, y: 24 }, ctx, 0, 0);
    // ring indicator (passive) just left of the item boxes
    if (l.hasRing) {
      ctx.fillStyle = '#3858f8'; ctx.beginPath(); ctx.arc(110, 32, 5, 0, 7); ctx.fill();
      ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(110, 32, 2, 0, 7); ctx.fill();
    }

    // counts
    Engine.text(ctx, 'X' + pad3(l.rupees), 170, 12, '#fff');   // rupees
    // rupee icon
    ctx.fillStyle = '#34b233'; ctx.fillRect(170, 22, 8, 12);
    Engine.text(ctx, 'X' + pad3(l.keys), 170, 36, '#fff');     // keys
    ctx.fillStyle = '#f8d030'; ctx.fillRect(196, 36, 6, 10);
    Engine.text(ctx, 'X' + pad3(l.bombs), 170, 50, '#fff');    // bombs
    ctx.fillStyle = '#202020'; ctx.fillRect(196, 50, 8, 10);

    // hearts (right)
    Engine.text(ctx, '-LIFE-', 200, 8, '#d82828');
    const hearts = l.maxHealth / 2;
    for (let i = 0; i < hearts; i++) {
      const hx = 200 + (i % 8) * 8, hy = 24 + Math.floor(i / 8) * 12;
      const filled = l.health - i * 2;
      drawHeart(ctx, hx, hy, filled >= 2 ? 'full' : filled === 1 ? 'half' : 'empty');
    }
  }
  function drawBIcon(ctx, item, x, y) {
    if (item === 'bomb') { ctx.fillStyle = '#202020'; ctx.fillRect(x + 3, y + 2, 9, 9); ctx.fillStyle = '#888'; ctx.fillRect(x + 6, y, 3, 3); }
    else if (item === 'bow') { ctx.fillStyle = '#d8a020'; ctx.fillRect(x + 4, y, 2, 13); ctx.fillStyle = '#fff'; ctx.fillRect(x + 5, y + 5, 7, 2); }
    else if (item === 'boomerang') { ctx.fillStyle = '#d8a020'; ctx.fillRect(x + 2, y + 7, 5, 3); ctx.fillRect(x + 2, y + 2, 3, 6); ctx.fillRect(x + 2, y + 2, 8, 3); }
    else if (item === 'candle') { ctx.fillStyle = '#d82828'; ctx.fillRect(x + 4, y + 5, 6, 8); ctx.fillStyle = '#f87800'; ctx.beginPath(); ctx.arc(x + 7, y + 3, 3, 0, 7); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillRect(x + 6, y + 5, 2, 2); }
    else if (item === 'firerod') { ctx.fillStyle = '#d82828'; ctx.fillRect(x+5, y+2, 4, 11); ctx.fillStyle = '#f87800'; ctx.beginPath(); ctx.arc(x+7, y+2, 4, 0, 7); ctx.fill(); }
  }
  function drawHeart(ctx, x, y, kind) {
    const draw = (col) => { ctx.fillStyle = col; ctx.fillRect(x + 1, y, 2, 2); ctx.fillRect(x + 5, y, 2, 2); ctx.fillRect(x, y + 1, 8, 3); ctx.fillRect(x + 1, y + 4, 6, 1); ctx.fillRect(x + 2, y + 5, 4, 1); ctx.fillRect(x + 3, y + 6, 2, 1); };
    if (kind === 'full') draw('#d82828');
    else if (kind === 'empty') draw('#202020');
    else { ctx.fillStyle = '#202020'; ctx.fillRect(x, y, 8, 7); ctx.save(); ctx.beginPath(); ctx.rect(x, y, 4, 8); ctx.clip(); draw('#d82828'); ctx.restore(); }
  }
  function pad3(n) { n = Math.max(0, Math.min(999, n | 0)); return (n < 10 ? '00' : n < 100 ? '0' : '') + n; }

  function drawMiniMap(ctx, x, y) {
    if (state.mode === 'dungeon') {
      for (let r = 0; r <= 2; r++) for (let c = 0; c <= 3; c++) {
        if (!Dungeon.getRoom(state.level, c, r)) continue;
        const cur = (c === state.col && r === state.row);
        ctx.fillStyle = cur ? (((Date2() >> 0) & 1) ? '#f8d030' : '#888') : '#0048b0';
        ctx.fillRect(x + c * 9, y + r * 8, 7, 6);
      }
    } else {
      // full overworld grid, compact so it fits the HUD; current screen lit yellow
      const C = World.COLS_W, R = World.ROWS_W, step = 2, sz = 2;
      for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
        if (!World.has(c, r)) continue;
        const cur = (c === state.col && r === state.row);
        ctx.fillStyle = cur ? '#f8d030' : '#1c5018';
        ctx.fillRect(x + c * step, y + r * step, sz, sz);
      }
    }
  }
  // tiny blink counter without Date.now()
  let _blink = 0; function Date2() { _blink = (_blink + 1) & 31; return _blink >> 4; }

  // ---------- overlays ----------
  function drawMessage(ctx) {
    const lines = wrap(state.msg, 28);
    const h = lines.length * 12 + 12;
    const y = HUD_H + PLAY_H - h - 8;
    ctx.fillStyle = 'rgba(0,0,0,0.85)'; ctx.fillRect(16, y, PLAY_W - 32, h);
    ctx.strokeStyle = '#fff'; ctx.strokeRect(16.5, y + 0.5, PLAY_W - 33, h - 1);
    lines.forEach((ln, i) => Engine.text(ctx, ln, 24, y + 8 + i * 12, '#fff'));
  }
  function wrap(str, n) {
    const words = String(str).split(' '); const out = []; let cur = '';
    for (const w of words) { if ((cur + ' ' + w).trim().length > n) { out.push(cur.trim()); cur = w; } else cur += ' ' + w; }
    if (cur.trim()) out.push(cur.trim()); return out;
  }

  function drawTitle(ctx) {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    // triforce
    const cx = 128, ty = 36;
    drawBigTriforce(ctx, cx, ty);
    Engine.text(ctx, 'THE LEGEND OF', cx - 52, 96, '#fff', 1);
    Engine.text(ctx, 'Z E L D A', cx - 56, 112, '#f8d030', 2);
    ctx.strokeStyle = '#f8d030'; ctx.strokeRect(28.5, 108.5, 200, 22);
    if (((Date2()) & 1)) Engine.text(ctx, 'PRESS  START', cx - 48, 168, '#fff');
    Engine.text(ctx, 'A CLONE - 2026', cx - 56, 200, '#888');
    Engine.text(ctx, 'ARROWS MOVE  Z SWORD  X BOMB', 16, 220, '#666');
  }
  function drawBigTriforce(ctx, cx, y) {
    ctx.fillStyle = '#f8d030';
    const tri = (px, py, s) => { for (let i = 0; i < s; i++) ctx.fillRect(px - i, py + i * 2, (i * 2 + 1), 2); };
    tri(cx, y, 12);          // top
    tri(cx - 26, y + 26, 12); // bottom-left
    tri(cx + 26, y + 26, 12); // bottom-right
  }

  function drawGameOver(ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(0, HUD_H, PLAY_W, PLAY_H);
    Engine.text(ctx, 'GAME  OVER', 84, HUD_H + 70, '#d82828', 1);
    if (((Date2()) & 1)) Engine.text(ctx, 'PRESS START', 84, HUD_H + 96, '#fff');
  }
  function drawWin(ctx) {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    drawBigTriforce(ctx, 128, 40);
    Engine.text(ctx, 'YOU RESTORED THE', 64, 104, '#fff');
    Engine.text(ctx, 'TRIFORCE OF WISDOM!', 50, 122, '#f8d030');
    Engine.text(ctx, 'ALL ' + Dungeon.count + ' DUNGEONS CLEARED', 50, 150, '#fff');
    Engine.text(ctx, 'PEACE RETURNS TO HYRULE', 36, 168, '#888');
    if (state.flashWin > 120 && ((Date2()) & 1)) Engine.text(ctx, 'PRESS START', 84, 196, '#888');
  }

  // ---------- boot ----------
  function init() {
    dbg('init:sprites');
    Sprites.init();
    dbg('init:link');
    state.link = E.makeLink(7 * 16, 8 * 16);
    dbg('init:run');
    Engine.run(update, render);
    dbg('running');
  }

  return { init, state,
    // test hooks (harmless; enable headless integration testing)
    _test: { loadOverworld, loadDungeonRoom, enterDungeon, enterCave, exitCave, exitDungeon, startGame, collect } };
})();

// Scripts are at bottom of <body> so DOM is ready — no need to wait for window.load.
(function() {
  var _d = document.getElementById('dbg');
  if (_d) { _d.style.display='block'; _d.textContent='calling init...'; }
  try {
    Game.init();
    if (_d) _d.style.display='none';
  } catch(e) {
    var msg = (e && e.message ? e.message : String(e));
    if (_d) { _d.style.display='block'; _d.textContent='INIT ERR: ' + msg + ' | ' + (e && e.stack ? e.stack.split('\n').slice(0,2).join(' ') : ''); }
    var c = document.getElementById('screen');
    if (c) {
      var x = c.getContext('2d');
      x.fillStyle = '#000'; x.fillRect(0, 0, 256, 240);
      x.fillStyle = '#f44'; x.font = '8px monospace'; x.textBaseline = 'top';
      x.fillText('INIT ERR:', 4, 4);
      x.fillStyle = '#fff';
      var words = msg.split(' '), line = '', y = 16;
      for (var i = 0; i < words.length; i++) {
        if ((line + ' ' + words[i]).length > 28) { x.fillText(line.trim(), 4, y); y += 10; line = words[i]; }
        else line += ' ' + words[i];
      }
      if (line.trim()) x.fillText(line.trim(), 4, y);
    }
  }
})();
