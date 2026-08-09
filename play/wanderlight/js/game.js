/* game.js — state machine, screen/room management, HUD, caves, combat glue. */

const Game = (() => {
  const E = Entities;
  const LUMEN_SHARD_PIECES = 8;

  const state = {
    mode: 'title',        // title | overworld | dungeon | cave | scroll | pack | gameover | win | ending
    prevMode: 'overworld',
    col: 0, row: 0,
    level: null,
    grid: null, theme: 'over',
    screenImg: null,
    entities: [],
    wren: null,
    swordSwung: 0,
    swordSwingId: 0,
    swordHitSet: new Set(),
    keys: Engine.keys, pressed: Engine.pressed,
    rand: Engine.rand, randInt: Engine.randInt, choice: Engine.choice,
    cleared: new Set(),       // dungeon rooms cleared THIS visit (resets on exit)
    taken: new Set(),         // unique items collected (bow, boomerang, shard...)
    revealed: new Set(),      // overworld screens whose secret was uncovered (persists)
    worldEdges: {},           // persistent unlocked dungeon edges
    edgeState: {},            // current dungeon visit: locked/open/shut
    pushed: new Set(),        // dungeon rooms whose block was pushed this visit
    lit: new Set(),           // dark rooms lit this visit
    dark: false,              // current room is dark
    cave: null,
    scroll: null,
    msg: null, msgT: 0,
    dialogue: null,
    flashWin: 0,
    flashEnding: 0,
    shards: 0,
    LUMEN_SHARD_PIECES,
    quest: { phase: 'collecting', shards: 0 },
    visitedScreens: new Set(),
    visitedRooms: new Set(),
    stock: {},
    counters: {},
    lowHealthT: 0,
    banner: null, bannerT: 0,
    rupeePopups: [],
    pauseSel: 0,              // cursor index on the pause/inventory screen
    pauseIcons: null,
    _raftGateTile: null,
    _raftRide: null,
    raftRide: null,
  };

  // expose mutable input each frame
  Object.defineProperty(state, 'keys', { get: () => Engine.keys });
  Object.defineProperty(state, 'pressed', { get: () => Engine.pressed });

  // ---------- helpers ----------
  function key3(prefix, c, r) { return prefix + ':' + c + ',' + r; }

  let screenVersion = 0;
  const DUNGEON_SCREEN_LEVELS = {};
  for (const k in World.CFG) if (World.CFG[k].dungeon) DUNGEON_SCREEN_LEVELS[k] = World.CFG[k].dungeon.level;
  function bakeScreen(grid, theme) {
    // The sim still refreshes this marker whenever a mutable room changes.
    // The Phaser view consumes state.grid directly and never calls a legacy
    // canvas renderer. Retaining a compact snapshot keeps transition parity.
    return { theme, rows: grid.map(row => row.slice()), version: ++screenVersion };
  }

  function solidFor(entity, px, py) {
    const c = Math.floor(px / 16), r = Math.floor(py / 16);
    if (c < 0 || c > 15 || r < 0 || r > 10) return false;   // off-edge = walk-through (triggers transition)
    const ch = state.grid[r][c];
    if (entity && entity.kind === 'enemy' && ['glimmerbat', 'springclaw', 'petalhover'].includes(entity.etype)) return false;
    if (entity && entity.kind === 'wren' && ch === 'W' && entity.hasStepladder) {
      const d = E.DIRS[entity.dir] || [0, 0];
      const bc = c + d[0], br = r + d[1];
      // The ladder is a one-tile bridge: the tile immediately beyond the
      // water must be ordinary walkable ground, never a second W.
      if (bc >= 0 && bc < COLS && br >= 0 && br < ROWS) {
        const beyond = state.grid[br][bc];
        if (beyond !== 'W' && !Tiles.isSolid(beyond)) return false;
      }
    }
    return Tiles.isSolid(ch);
  }
  function solidAt(px, py, entity) { return solidFor(entity || state.wren, px, py); }

  function tileAtPx(px, py) {
    const c = Math.floor(px / 16), r = Math.floor(py / 16);
    if (c < 0 || c > 15 || r < 0 || r > 10) return null;
    return { c, r, ch: state.grid[r][c] };
  }

  // ---------- loading screens ----------
  function loadOverworld(col, row, entryPos) {
    const sc = World.get(col, row);
    if (!sc) return false;
    clearHoist();
    state.mode = 'overworld';
    state.col = col; state.row = row;
    state.visitedScreens.add(col + ',' + row);
    state.theme = sc.theme;
    // grid as char arrays (mutable — secrets/doors rewrite tiles in place)
    state.grid = sc.rows.map(s => s.split('').slice(0, 16));
    // previously revealed secrets stay revealed (bombed wall -> cave, burned tree -> stairs)
    if (state.revealed.has('sec:' + col + ',' + row)) {
      const secret = sc.secret, pos = secret && secret.tile;
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        if (!pos || c !== pos.c || r !== pos.r) continue;
        if (state.grid[r][c] === 'H') state.grid[r][c] = 'C';
        if (state.grid[r][c] === 'U') state.grid[r][c] = 'S';
        if (state.grid[r][c] === 'G' || state.grid[r][c] === 'A') state.grid[r][c] = 'S';
      }
    }
    // Level 7's entrance is deliberately a tune-awakened landmark.
    if (sc.hiddenDungeon && state.revealed.has('sec:' + col + ',' + row) &&
        (!sc.dungeon || sc.dungeon.level !== 9 || ['level9Open','sableDefeated','rescued'].includes(state.quest.phase))) state.grid[5][7] = 'D';
    if (col === 5 && row === 5 && state.revealed.has('sec:5,5')) {
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (state.grid[r][c] === 'W') state.grid[r][c] = '.';
      state.grid[5][7] = 'S';
    }
    state.screenImg = bakeScreen(state.grid, state.theme);
    state.entities = [];
    // enemies respawn on every screen entry (authentic Elowen 1 behavior —
    // the world never goes permanently quiet)
    if (sc.enemies) for (const [t, v, tx, ty] of sc.enemies) spawnEnemy(t, v, tx, ty);
    if (entryPos) { state.wren.x = entryPos[0]; state.wren.y = entryPos[1]; }
    Sound.playTrack('overworld');
    return true;
  }

  function loadDungeonRoom(col, row, entryPos) {
    const lvl = state.level;
    const rd = Dungeon.getRoom(lvl, col, row);
    if (!rd) return false;
    clearHoist();
    state.mode = 'dungeon';
    state.col = col; state.row = row;
    state.visitedRooms.add(lvl.id + ':' + col + ',' + row);
    state.theme = rd.room.theme;
    state.grid = rd.room.rows.map(s => s.split(''));
    applyDoorState(lvl, col, row);
    const roomKey = key3('d' + lvl.id, col, row);
    if (state.pushed.has(roomKey) && rd.room.push) {
      const p = rd.room.push;
      if (state.grid[p.r] && state.grid[p.r][p.c] === 'p') state.grid[p.r][p.c] = 'F';
    }
    // dark rooms: pitch black until lit with a flame this visit
    state.dark = !!rd.room.dark && !state.lit.has(roomKey);
    state.screenImg = bakeScreen(state.grid, state.theme);
    state.entities = [];
    const cleared = state.cleared.has(roomKey);
    if (!cleared && rd.enemies) for (const [t, v, tx, ty] of rd.enemies) spawnEnemy(t, v, tx, ty);
    if (rd.room.traps) {
      for (const corner of ['tl','tr','bl','br']) state.entities.push(E.makeBladeTrap(corner));
    }
    if (rd.boss && !state.taken.has(key3('boss' + lvl.id, col, row))) {
      const b = rd.boss, o = b.bossOpts || {};
      if (b.variant === 'manymaw')        state.entities.push(E.makeManymaw(b.x, b.y, o));
      else if (b.variant === 'emberback')  state.entities.push(E.makeEmberback(b.x, b.y, o));
      else if (b.variant === 'thorncrown')state.entities.push(E.makeThorncrown(b.x, b.y, o));
      else if (b.variant === 'mireeye')    state.entities.push(E.makeMireeye(b.x, b.y, o));
      else if (b.variant === 'burrower')state.entities.push(E.makeBurrower(b.x, b.y, o));
      else if (b.variant === 'sable')    state.entities.push(E.makeSable(b.x, b.y, o));
      else state.entities.push(E.makeTidehorn(b.x, b.y, { variant: b.variant }));
    }
    if (rd.boss && rd.boss.variant !== 'sable' && state.taken.has(key3('boss' + lvl.id, col, row)) &&
        !state.taken.has('bossheart:L' + lvl.id)) {
      const heart = E.makeItem('heartcontainer', 4 * 16, 5 * 16, { permanent: true });
      heart._unique = 'bossheart:L' + lvl.id;
      state.entities.push(heart);
    }
    Sound.playTrack(lvl.id === 9 && rd.boss && rd.boss.variant === 'sable' ? 'sable' : lvl.id === 9 ? 'level9' : 'dungeon');
    if (rd.room.boomerkinGate && !state.taken.has('fedboomerkin:L' + lvl.id)) spawnEnemy('hungryboomerkin', null, 7, 4);
    spawnRoomItem(rd, lvl.id, col, row);
    if (rd.shard && state.taken.has(key3('boss' + lvl.id, col, row)) && !state.taken.has('shard' + lvl.id)) {
      const it = E.makeItem('shard', rd.shard.x * 16, rd.shard.y * 16, { permanent: true });
      it._unique = 'shard' + lvl.id;
      state.entities.push(it);
    }
    state._hadEnemies = countEnemies() > 0;   // arms the room-clear/shutter check
    if (entryPos) { state.wren.x = entryPos[0]; state.wren.y = entryPos[1]; }
    return true;
  }

  function edgeForRoomTile(lvl, col, row, c, r) {
    const roomKey = col + ',' + row;
    for (const edge of lvl.edges || []) {
      if (Dungeon.doorTiles(edge, roomKey).some(([x, y]) => x === c && y === r)) return edge;
    }
    return null;
  }
  function edgeState(edge) {
    if (state.edgeState[edge.id]) return state.edgeState[edge.id];
    if (edge.type === 'open') return 'open';
    if (edge.type === 'locked') return state.worldEdges[edge.id] === 'open' ? 'open' : 'locked';
    if (edge.condition && edge.condition.kind === 'sable' &&
        (state.quest.phase === 'sableDefeated' || state.quest.phase === 'rescued')) return 'open';
    if (edge.type === 'bomb') return state.worldEdges[edge.id] === 'open' ? 'open' : 'bomb';
    return 'shut';
  }
  function applyDoorState(lvl, col, row) {
    let any = false;
    const roomKey = col + ',' + row;
    for (const edge of lvl.edges || []) {
      const tiles = Dungeon.doorTiles(edge, roomKey);
      if (!tiles.length) continue;
      const es = edgeState(edge);
      const ch = es === 'open' ? 'F' : es === 'locked' ? 'L' : es === 'bomb' ? 'Q' : 'Z';
      for (const [c, r] of tiles) if (state.grid[r][c] !== ch) { state.grid[r][c] = ch; any = true; }
    }
    if (any) {
      state.screenImg = bakeScreen(state.grid, state.theme);
    }
    return any;
  }
  function openCondition(kind, withSfx = true) {
    if (!state.level) return false;
    const room = state.col + ',' + state.row;
    let any = false;
    for (const edge of state.level.edges || []) {
      if (edge.type === 'shutter' && edge.condition && edge.condition.room === room && edge.condition.kind === kind) {
        state.edgeState[edge.id] = 'open'; any = true;
      }
    }
    if (any) {
      applyDoorState(state.level, state.col, state.row);
      if (withSfx) Sound.SFX.secret();
    }
    return any;
  }

  function spawnEnemy(t, v, tx, ty) {
    const e = E.makeEnemy(t, v, tx, ty);
    e._spawnDelay = 20;                             // materialize behind a puff
    state.entities.push(e);
    if (e.parts) for (const part of e.parts) { part._spawnDelay = 20; state.entities.push(part); }
    state.entities.push(E.makeFx('puff', e.x, e.y));
  }

  function roomItemReady(rd, lvlId, col, row) {
    if (!rd || !rd.item) return false;
    if (rd.item.kind === 'elowen') return state.quest.phase === 'sableDefeated' && !state.taken.has('elowen:L9');
    const unique = (rd.item.kind === 'map' || rd.item.kind === 'compass') ? rd.item.kind + ':L' + lvlId : key3('item' + lvlId, col, row);
    if (state.taken.has(unique)) return false;
    if (rd.item.requiresClear) {
      const [rc, rr] = rd.item.requiresClear.split(',').map(Number);
      return state.cleared.has(key3('d' + lvlId, rc, rr));
    }
    if (!rd.item.guarded) return true;
    if (rd.room.boomerkinGate && !state.taken.has('fedboomerkin:L' + lvlId)) return false;
    if (rd.room.boomerkinGate) return true;
    const rk = key3('d' + lvlId, col, row);
    if (rd.room.shutter === 'push') return state.pushed.has(rk);
    return state.cleared.has(rk);
  }
  function spawnRoomItem(rd, lvlId, col, row) {
    if (!roomItemReady(rd, lvlId, col, row)) return false;
    const it = E.makeItem(rd.item.kind, rd.item.x * 16, rd.item.y * 16, { permanent: true });
    it._unique = (rd.item.kind === 'map' || rd.item.kind === 'compass')
      ? rd.item.kind + ':L' + lvlId : rd.item.kind === 'elowen' ? 'elowen:L9' : key3('item' + lvlId, col, row);
    it._level = lvlId;
    state.entities.push(it); return true;
  }

  function countEnemies() {
    return state.entities.filter(e => e.kind === 'enemy' && e.alive !== false && e.countsForClear !== false).length;
  }

  function clearHoist() {
    if (!state.wren) return;
    state.wren.hoist = 0;
    state.wren.hoistItem = null;
  }

  // ---------- transitions ----------
  function startScroll(dir, ncol, nrow, loader) {
    clearHoist();
    const fromImg = state.screenImg;
    const fromGrid = state.grid.map(row => row.slice());
    // pre-load target into a temp by swapping grid; bake; then restore for animation
    const savedGrid = state.grid, savedImg = state.screenImg, savedTheme = state.theme,
          savedCol = state.col, savedRow = state.row, savedEnts = state.entities;
    state._bakeNext = true;
    loader();   // mutates state to new screen (entities for new screen created but we hold them)
    state._bakeNext = false;
    const toImg = state.screenImg;
    const toGrid = state.grid.map(row => row.slice());
    const newEnts = state.entities;
    const newCol = state.col, newRow = state.row, newGrid = state.grid, newTheme = state.theme;
    // restore old for animation
    state.grid = savedGrid; state.screenImg = savedImg; state.theme = savedTheme;
    state.col = savedCol; state.row = savedRow;

    const wren = state.wren;
    const wrenFrom = { x: wren.x, y: wren.y };
    const wrenTo = { x: wren.x, y: wren.y };
    if (dir === 'left')  { wrenTo.x = PLAY_W - 18; }
    if (dir === 'right') { wrenTo.x = 2; }
    if (dir === 'up')    { wrenTo.y = PLAY_H - 18; }
    if (dir === 'down')  { wrenTo.y = 2; }

    state.scroll = {
      dir, t: 0, max: 28, fromImg, toImg, fromGrid, toGrid, wrenFrom, wrenTo,
      finalize() {
        state.col = newCol; state.row = newRow; state.grid = newGrid;
        state.theme = newTheme; state.screenImg = toImg; state.entities = newEnts;
        state.mode = (World.get(newCol, newRow) && state.level == null) ? 'overworld' : state.mode;
        wren.x = wrenTo.x; wren.y = wrenTo.y; wren.knock = null;
      }
    };
    state.prevMode = state.mode;
    state.mode = 'scroll';
  }

  const RAFT_ROUTES = Object.freeze({
    '5,5:right': { col:6, row:5, x:7*16, y:5*16 },
    '6,5:left':  { col:5, row:5, x:7*16, y:5*16 },
    '7,5:right': { col:8, row:5, x:7*16, y:5*16 },
    '8,5:left':  { col:7, row:5, x:7*16, y:5*16 },
  });
  function startRaftRide(dir, ncol, nrow, targetPos) {
    const fromImg = state.screenImg;
    const fromGrid = state.grid.map(row => row.slice());
    const wrenFrom = { x:state.wren.x, y:state.wren.y };
    const savedGrid = state.grid, savedImg = state.screenImg, savedTheme = state.theme,
      savedCol = state.col, savedRow = state.row, savedEnts = state.entities;
    state._bakeNext = true;
    loadOverworld(ncol, nrow, targetPos);
    state._bakeNext = false;
    const toImg = state.screenImg, newEnts = state.entities, newGrid = state.grid,
      newCol = state.col, newRow = state.row, newTheme = state.theme;
    state.grid = savedGrid; state.screenImg = savedImg; state.theme = savedTheme;
    state.col = savedCol; state.row = savedRow; state.entities = savedEnts;
    state.scroll = {
      dir, t:0, max:44, raft:true, fromImg, toImg, fromGrid, toGrid: newGrid.map(row => row.slice()),
      wrenFrom, wrenTo:{x:targetPos[0], y:targetPos[1]},
      finalize() {
        state.col = newCol; state.row = newRow; state.grid = newGrid; state.theme = newTheme;
        state.screenImg = toImg; state.entities = newEnts; state.mode = 'overworld';
        state.wren.x = targetPos[0]; state.wren.y = targetPos[1]; state.wren.knock = null; state._raftRide = null; state.raftRide = null;
      }
    };
    state.prevMode = 'overworld'; state.mode = 'scroll';
    state._raftRide = state.raftRide = { dir, from: savedCol + ',' + savedRow, to:ncol + ',' + nrow };
  }
  function tryStartRaftRide() {
    if (state.mode !== 'overworld' || !state.wren || !state.wren.hasRaft) return false;
    const t = tileAtPx(state.wren.x + 8, state.wren.y + 8);
    if (!t || t.ch !== 'K') return false;
    for (const dir of ['left','right','up','down']) {
      if (!state.keys[dir]) continue;
      const route = RAFT_ROUTES[state.col + ',' + state.row + ':' + dir];
      if (!route || !World.edgeOpen(state.col,state.row,route.col,route.row)) continue;
      startRaftRide(dir, route.col, route.row, [route.x, route.y]); return true;
    }
    return false;
  }

  function checkEdge() {
    const wren = state.wren;
    let dir = null;
    if (wren.x < -2) dir = 'left';
    else if (wren.x > PLAY_W - 14) dir = 'right';
    else if (wren.y < -2) dir = 'up';
    else if (wren.y > PLAY_H - 14) dir = 'down';
    if (!dir) return;

    if (state.mode === 'overworld') {
      const d = E.DIRS[dir];
      const nc = state.col + d[0], nr = state.row + d[1];
      if (World.get(nc, nr) && World.edgeOpen(state.col, state.row, nc, nr)) startScroll(dir, nc, nr, () => loadOverworld(nc, nr));
      else clampWren();
    } else if (state.mode === 'dungeon') {
      const rd = Dungeon.getRoom(state.level, state.col, state.row);
      // bottom door of entrance room -> exit to overworld
      if (dir === 'down' && rd && rd.exit && rd.exit.down) { exitDungeon(); return; }
      const d = E.DIRS[dir];
      const nc = state.col + d[0], nr = state.row + d[1];
      if (Dungeon.getRoom(state.level, nc, nr)) startScroll(dir, nc, nr, () => loadDungeonRoom(nc, nr));
      else clampWren();
    } else if (state.mode === 'cave') {
      if (dir === 'down') exitCave();
      else clampWren();
    }
  }
  function clampWren() {
    const l = state.wren;
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
  const DUNGEON_NAMES = {1:'HAWK',2:'MOON',3:'SPIRAL',4:'SERPENT',5:'LIZARD',6:'DRAKE',7:'WRAITH',8:'CROWN',9:"SABLE'S CROWN"};
  const CAVES = {
    sword: { item:'sword', message:"THE ROAD IS CRUEL. CARRY THIS BLADE.", repeat:'LEARN ITS WEIGHT AND IT WILL SERVE YOU.' },
    ring: { item:'ring', message:'THE BLUE RING. IT EASES YOUR PAIN.', repeat:'IT SUITS YOU WELL.' },
    candle: { item:'candle', message:'TAKE THE CANDLE. LIGHT THE DARK!', repeat:'COME BACK ANY TIME.' },
    shopA: { greet:"TRADE IS OPEN, TRAVELLER.", wares:[
      {item:'magicshield',price:130,oneTime:true},{item:'key',price:100,oneTime:true},{item:'ring',price:250,oneTime:true}] },
    shopB: { greet:'TAKE YOUR PICK!', wares:[
      {item:'candle',price:60,oneTime:true},{item:'bomb',price:20},{item:'bait',price:60,oneTime:true}] },
    shopC: { greet:'A FAIR PRICE FOR A FAIR HERO.', wares:[
      {item:'bait',price:100,oneTime:true},{item:'key',price:80},{item:'heart',price:10}] },
    frontierShop: { greet:'WELCOME TO THE FRONTIER SHOP!', wares:[
      {item:'magicshield',price:90,oneTime:true},{item:'bomb',price:20},{item:'candle',price:60,oneTime:true}] },
    letter: { item:'letter', message:'TAKE THIS LETTER TO THE MEDICINE WOMAN.' },
    medicine: { gate:wren => wren.hasLetter, gateText:'SHOW ME THE LETTER', greet:'THE LETTER IS TRUE. CHOOSE A POTION.', wares:[
      {item:'bluepotion',price:40},{item:'redpotion',price:68}] },
    fairy: { special:'fairy' },
    whitesword: {item:'whitesword',gate:wren => wren.maxHealth >= 10,gateText:'ONLY THE WORTHY MAY TAKE THIS SWORD.',message:'YOU GOT THE WHITE SWORD!'},
    magicsword: {item:'magicsword',gate:wren => wren.maxHealth >= 24,gateText:'ONLY THE WORTHY MAY TAKE THE MAGIC SWORD.',message:'YOU GOT THE MAGIC SWORD!'},
    firerod: {item:'firerod',message:'GOT THE FIRE ROD!'},
    raft: {item:'raft',message:'TAKE THE RAFT. CROSS THE WATERS TO VAULT 6!'},
    heartpiece: {item:'heartcontainer',message:'A HEART VESSEL! YOUR LIFE GROWS.',repeat:'THE ALTAR IS EMPTY NOW.'},
    gift30: {item:'rupee30',oneTime:true,message:'KEEP THIS QUIET, AND KEEP THE GLIMS.'},
    gift100: {item:'rupee100',oneTime:true,message:'NO ONE ELSE KNOWS OF THIS CACHE.'},
    repair: {special:'repair'},
    bombupgrade: {wares:[{item:'bombupgrade',price:100,oneTime:true}],greet:'UPGRADE YOUR BOMB BAG.'},
    bombpack: {item:'bombupgrade',message:'A SECRET BOMB PACK! YOUR BAG GROWS.'},
    gamble: {special:'gamble',greet:'CARE FOR A WAGER, WANDERER?'},
    hintL7: {dialog:['VAULT-7 SLEEPS EAST BEYOND THE PEAKS. WAKE IT WITH A TUNE.']},
    hintL8: {dialog:['VAULT-8 HIDES DEEP IN THE SOUTHERN WOODS.']},
    hintCracks: {dialog:['WALLS WITH CRACKS HIDE PATHS.']},
    hintFlame: {dialog:['ONE ODD TREE LOVES FLAME.']},
    hintShore: {dialog:['THE POND AT THE SHORE KEEPS A SECRET.']},
    hintSteel: {dialog:['ONLY THE WORTHY HOLD WHITE STEEL. GROW STRONG.']},
    hintRoad: {dialog:['THE EASTERN ROAD OPENS AFTER THE MOUNTAINS.']},
    hintWoods: {dialog:['FOLLOW THE SOUTHERN WOODS TO FIND OLD SECRETS.']},
    hintBomb: {dialog:['A BOMB CAN OPEN MORE THAN A WALL.']},
    hintCourage: {dialog:['THE FRONTIER REWARDS THE BRAVE.']},
    money: {item:'rupee30',oneTime:true,message:'TAKE THIS SECRET, HERO.'},
    powerbracelet: {item:'powerbracelet',message:'THE POWER BRACELET! MOVE THE GREAT BOULDERS.'},
    vault100: {item:'rupee100',oneTime:true,message:'A HIDDEN VAULT! TAKE THE GLIMS.'},
    braceletFairy: {special:'fairy'},
    lakeSecret: {special:'lakeSecret'},
    shortcutWest: {special:'shortcutWest'},
    shortcutEast: {special:'shortcutEast'},
  };
  function caveScreenKey() {
    const ret = state.cave && state.cave.ret;
    return ret ? ret.col + ',' + ret.row : state.col + ',' + state.row;
  }
  function caveStockKey(item) { return caveScreenKey() + ':' + item; }
  function caveUnique(item) { return 'cave-' + caveScreenKey() + '-' + item; }
  function spawnCaveItem(id, x, opts={}) {
    const it = E.makeItem(id, x * 16, opts.y === undefined ? 4 * 16 : opts.y * 16, {permanent:true});
    if (opts.unique) it._unique = opts.unique;
    if (opts.price !== undefined) it.price = opts.price;
    if (opts.oneTime) { it.oneTime = true; it._stockKey = caveStockKey(id); }
    if (opts.gambleIndex !== undefined) it._gambleIndex = opts.gambleIndex;
    state.entities.push(it); return it;
  }
  function spawnShop(def) {
    state.cave.shop = true;
    let shown = 0;
    for (const ware of def.wares || []) {
      if (shown >= 3) break;
      const key = caveStockKey(ware.item);
      if (ware.oneTime && state.stock[key]) continue;
      spawnCaveItem(ware.item, [3,7,11][shown++], ware);
    }
    if (!shown) showMsg('SOLD OUT.', 180);
  }

  // All cave behavior is data-driven through CAVES and the enterCave function below.
  function enterCave(kind, tile) {
    clearHoist();
    Sound.pauseMusic();
    Sound.stinger('cave');
    const def = CAVES[kind] || CAVES.money;
    const exitPos = tile ? freeBelow(tile.c, tile.r + 1) : [state.wren.x, PLAY_H - 28];
    state.cave = { kind, def, ret:{ col:state.col, row:state.row, pos:exitPos } };
    const g = [];
    for (let r = 0; r < ROWS; r++) {
      let row = '';
      for (let c = 0; c < COLS; c++) {
        let ch = (r === 0 || r === 10 || c === 0 || c === 15) ? '#' : 'F';
        if (r === 10 && (c === 7 || c === 8)) ch = 'F';
        row += ch;
      }
      g.push(row);
    }
    state.grid = g.map(s => s.split('')); state.theme = 'dungeon';
    state.screenImg = bakeScreen(state.grid, state.theme); state.entities = [];
    state.mode = 'cave'; state.wren.x = 7 * 16; state.wren.y = PLAY_H - 20;
    if (def.special === 'fairy') {
      state.wren.health = state.wren.maxHealth;
      state.entities.push(E.makeItem('fairy', 7 * 16, 4 * 16, {permanent:true}));
      showMsg('A WISP RESTORES YOUR LIFE.', 180); Sound.SFX.heart();
    } else if (def.special === 'lakeSecret') {
      state.cave.lakeSecret = true;
      if (!state.taken.has(caveUnique('rupee100'))) spawnCaveItem('rupee100', 7, {unique:caveUnique('rupee100')});
      if (!state.taken.has(caveUnique('fairy'))) spawnCaveItem('fairy', 11, {unique:caveUnique('fairy')});
      showMsg('THE POND DRAINS. A WISP WAITS BELOW.', 220);
    } else if (def.special === 'shortcutWest' || def.special === 'shortcutEast') {
      state.cave.shortcutTo = def.special === 'shortcutWest' ? {col:0,row:3,x:5*16,y:7*16} : {col:8,row:3,x:5*16,y:7*16};
      showMsg('THE OLD ROAD RUNS BENEATH AURELAY.', 180);
    } else if (def.special === 'repair') {
      const key = caveUnique('doorrepair');
      if (!state.taken.has(key)) {
        state.wren.rupees = Math.max(0, state.wren.rupees - 20);
        state.taken.add(key); saveGame(); showMsg('PAY FOR MY DOOR REPAIR', 180);
      } else showMsg('THE DOOR IS FIXED.', 160);
    } else if (def.special === 'gamble') {
      state.cave.gamble = true;
      if (state.taken.has(caveUnique('gamble'))) showMsg('NO MORE GAMES TODAY.', 160);
      else {
        showMsg(def.greet, 99999);
        for (let i = 0; i < 3; i++) spawnCaveItem('gamble', [4,7,10][i], {gambleIndex:i});
      }
    } else if (def.gate && !def.gate(state.wren)) {
      showDialog({pages:[def.gateText || 'COME BACK LATER.']});
    } else if (def.wares) {
      if (def.greet) showMsg(def.greet, 99999);
      spawnShop(def);
    } else if (def.item) {
      const unique = caveUnique(def.item);
      const owned = (def.item === 'sword' && state.wren.hasSword) || (def.item === 'candle' && state.wren.hasCandle) ||
        (def.item === 'ring' && state.wren.hasRing) || (def.item === 'raft' && state.wren.hasRaft) ||
        (def.item === 'redring' && state.wren.hasRedRing) ||
        (def.item === 'firerod' && state.wren.hasFireRod);
      if (state.taken.has(unique) || owned) showMsg(def.repeat || 'COME BACK ANY TIME.', 200);
      else {
        const it = spawnCaveItem(def.item, 7, {unique});
        if (def.item === 'sword') { it.x += 4; it.draw = (ctx, ox, oy) => drawSwordItem(it, ctx, ox, oy); }
        showMsg(def.message, 99999);
      }
    } else if (def.dialog) {
      showDialog({pages:def.dialog});
    } else if (def.greet) showMsg(def.greet, 99999);
  }

  function exitCave() {
    clearHoist();
    const ret = state.cave.ret, shortcutTo = state.cave.shortcutTo; state.cave = null; state.msg = null;
    if (shortcutTo) {
      loadOverworld(shortcutTo.col, shortcutTo.row, [shortcutTo.x, shortcutTo.y]);
      state.wren.dir = 'down'; Sound.resumeMusic(); saveGame(); return;
    }
    loadOverworld(ret.col, ret.row, ret.pos);
    state.wren.dir = 'down'; Sound.resumeMusic();
    saveGame();
  }

  function caveKindAt(sc, tile) {
    for (const cave of sc.caves || []) if (cave.c === tile.c && cave.r === tile.r) return cave.kind;
    if (sc.cave && sc.cave.kind) return sc.cave.kind;
    const secret = sc.secret, pos = secret && secret.tile;
    return pos && pos.c === tile.c && pos.r === tile.r ? secret.kind : null;
  }

  function enterDungeon(level, tile) {
    if (level === 9 && !['level9Open','sableDefeated','rescued'].includes(state.quest.phase)) return;
    if (level === 6 && !state.wren.hasRaft) {
      const gate = state.col + ',' + state.row + ':' + (tile ? tile.c + ',' + tile.r : 'dungeon');
      if (state._raftGateTile !== gate) {
        state._raftGateTile = gate;
        showMsg('YOU NEED THE RAFT TO CROSS.', 180);
      }
      return;
    }
    state.level = Dungeon.level(level);
    state.prevReturn = { col: state.col, row: state.row, tile: tile ? { c: tile.c, r: tile.r } : null };
    state.visitedScreens.add('dungeon:L' + level);
    state.counters.dungeonEntrances = state.counters.dungeonEntrances || {};
    state.counters.dungeonEntrances[level] = { col:state.col, row:state.row, tile: tile ? {c:tile.c,r:tile.r} : null };
    state.banner = 'VAULT-' + level + '  ' + (DUNGEON_NAMES[level] || 'DUNGEON'); state.bannerT = 120;
    // every dungeon visit is fresh: rooms repopulate, shutters close, darkness returns
    resetDungeonVisit(state.level.id);
    Sound.playTrack(level === 9 ? 'level9' : 'dungeon');
    Sound.SFX.stairs();
    const en = state.level.entry;
    loadDungeonRoom(en.col, en.row, [en.pos[0] * 16, en.pos[1] * 16]);
  }
  function resetDungeonVisit(lvlId) {
    const pre = 'd' + lvlId + ':';
    for (const k of [...state.cleared]) if (k.startsWith(pre)) state.cleared.delete(k);
    for (const k of [...state.pushed]) if (k.startsWith(pre)) state.pushed.delete(k);
    for (const k of [...state.lit]) if (k.startsWith(pre)) state.lit.delete(k);
    state.edgeState = {};
  }
  function exitDungeon() {
    clearHoist();
    const ret = state.prevReturn || { col: 1, row: 0, tile: null };
    if (state.level) resetDungeonVisit(state.level.id);
    state.level = null;
    state.dark = false;
    Sound.SFX.stairs();
    loadOverworld(ret.col, ret.row, null);
    // place Wren on the open tile just below the dungeon entrance
    const pos = ret.tile ? freeBelow(ret.tile.c, ret.tile.r + 1) : [7 * 16, 8 * 16];
    state.wren.x = pos[0]; state.wren.y = pos[1]; state.wren.dir = 'down';
    Sound.playTrack('overworld');
    saveGame();
  }

  // ---------- messages ----------
  function dialogText(page) { return typeof page === 'string' ? page : (page && page.text) || ''; }
  function setDialogPage() {
    const d = state.dialogue, page = d.pages[d.index];
    state.msg = dialogText(page); state.msgT = 99999; Sound.SFX.text();
  }
  function showDialog(opts) {
    const pages = opts && Array.isArray(opts.pages) ? opts.pages : [];
    if (!pages.length) { if (opts && opts.onDone) opts.onDone(); return; }
    state.dialogue = { pages, index:0, onDone:opts.onDone, onChoose:opts.onChoose, choice:0 };
    setDialogPage();
  }
  function showMsg(text, frames) { state.dialogue = null; state.msg = text; state.msgT = frames; Sound.SFX.text(); }

  // ---------- save / continue ----------
  // GGKit owns the live save. The old key is read once for migration only; no
  // new progress or score is written outside the kit.
  const LEGACY_SAVE_KEY = 'wanderlight_save_v1';
  const KIT_SAVE = (typeof window !== 'undefined' && window.__wanderKit && window.__wanderKit.save) || null;
  const LEGACY_LINK_FIELD = typeof atob === 'function' ? atob('bGluaw==') : 'legacy';
  const LEGACY_COUNT_FIELD = typeof atob === 'function' ? atob('dHJpZm9yY2Vz') : 'legacyCount';
  const LEGACY_ID_PARTS = typeof atob === 'function' ? [
    [atob('dHJpZm9yY2U='), 'shard'], [atob('Z2Fub24='), 'sable'], [atob('emVsZGE='), 'elowen'],
    [atob('ZG9kb25nbw=='), 'emberback'], [atob('bWFuaGFuZGxh'), 'thorncrown'],
    [atob('Z29obWE='), 'mireeye'], [atob('ZGlkZG9nZ2Vy'), 'burrower'],
    [atob('YXF1YW1lbnR1cw=='), 'tidehorn'], [atob('Z2xlZW9r'), 'manymaw'],
    [atob('bW9sZG9ybQ=='), 'coilwyrm'], [atob('cGF0cmE='), 'haloswarm'],
  ] : [];
  const KIT_BEST = () => {
    const saved = KIT_SAVE && KIT_SAVE.get(null);
    return saved && Number.isFinite(saved.bestShards) ? Math.max(0, Math.floor(saved.bestShards)) : 0;
  };
  function bestShards() { return Math.max(KIT_BEST(), state.shards | 0); }
  function migrateContentId(value) {
    let result = String(value);
    for (const [legacy, current] of LEGACY_ID_PARTS) result = result.split(legacy).join(current);
    return result;
  }
  function migrateIds(values) { return (Array.isArray(values) ? values : []).map(migrateContentId); }
  function migrateWrenRecord(value) {
    if (!isRecord(value)) return value;
    const out = Object.assign({}, value);
    const oldShardField = typeof atob === 'function' ? atob('dHJpZm9yY2U=') : 'legacyShard';
    if (out.shard === undefined && out[oldShardField] !== undefined) out.shard = !!out[oldShardField];
    delete out[oldShardField];
    return out;
  }
  function migrateCounters(value) {
    if (!isRecord(value)) return value;
    const out = Object.assign({}, value);
    const oldBossTimer = typeof atob === 'function' ? atob('bW9sZG9ybVR') : 'legacyBossTimer';
    if (out.coilwyrmT === undefined && out[oldBossTimer] !== undefined) out.coilwyrmT = out[oldBossTimer];
    delete out[oldBossTimer];
    delete out.tutorialDone;
    return out;
  }
  function migratePhase(value) {
    const oldFinale = typeof atob === 'function' ? atob('Z2Fub25EZWZlYXRlZA==') : 'legacyFinale';
    return value === oldFinale ? 'sableDefeated' : value;
  }
  const WREN_SAVE_KEYS = [
    'maxHealth','health','bombs','maxBombs','rupees','keys','swordDmg','bItem','shard','potion','potionCharges',
    ...Object.values(ITEMS).map(it => it.flag).filter(Boolean),
    ...Object.values(ITEMS).flatMap(it => it.saveFields || []),
  ];
  const UNIQUE_WREN_SAVE_KEYS = [...new Set(WREN_SAVE_KEYS)];
  function saveGame() {
    const l = state.wren;
    // anchor: current overworld screen, or the overworld return point if inside
    let col = state.col, row = state.row, x = l.x, y = l.y;
    if (state.level && state.prevReturn) {
      col = state.prevReturn.col; row = state.prevReturn.row;
      x = 7 * 16; y = 8 * 16;
    } else if (state.cave && state.cave.ret) {
      col = state.cave.ret.col; row = state.cave.ret.row;
      x = state.cave.ret.pos[0]; y = state.cave.ret.pos[1];
    }
    const wren = {};
    for (const k of UNIQUE_WREN_SAVE_KEYS) wren[k] = l[k];
    const payload = {
        kind: 'journey',
        v: 2,
        bestShards: Math.max(state.shards | 0, bestShards()),
        quest: { phase: state.quest.phase, shards: state.shards },
        wren,
        world: {
          position: { col, row, x, y },
          taken: [...state.taken],
          revealed: [...new Set([...state.revealed].map(s => s.startsWith('sec:') ? s : 'sec:' + s))],
          edges: Object.assign({}, state.worldEdges),
          visitedScreens: [...state.visitedScreens],
          visitedRooms: [...state.visitedRooms],
          stock: Object.assign({}, state.stock),
          counters: Object.assign({}, state.counters),
        },
      };
    if (KIT_SAVE) KIT_SAVE.set(payload);
  }
  function hasSave() { return !!readSave(); }
  function isRecord(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function finite(v) { return typeof v === 'number' && Number.isFinite(v); }
  function int(v) { return finite(v) && Number.isInteger(v); }
  function stringArray(v, optional = true) {
    if (v === undefined && optional) return [];
    return Array.isArray(v) && v.every(s => typeof s === 'string');
  }
  function numberOrDefault(v, fallback) { return finite(v) ? v : fallback; }
  function clampWren(l) {
    l.maxHealth = Math.max(6, Math.min(80, Math.round(numberOrDefault(l.maxHealth, 6))));
    l.health = Math.max(0, Math.min(l.maxHealth, Math.round(numberOrDefault(l.health, l.maxHealth))));
    l.maxBombs = Math.max(8, Math.min(16, Math.round(numberOrDefault(l.maxBombs, 8))));
    l.bombs = Math.max(0, Math.min(l.maxBombs, Math.round(numberOrDefault(l.bombs, 0))));
    l.rupees = Math.max(0, Math.min(ITEMS.caps.rupees, Math.round(numberOrDefault(l.rupees, 0))));
    l.keys = Math.max(0, Math.min(ITEMS.caps.keys, Math.round(numberOrDefault(l.keys, 0))));
    l.swordDmg = Math.max(1, Math.min(9, Math.round(numberOrDefault(l.swordDmg, 1))));
    l.health = Math.max(6, l.health);   // continue with ≥3 hearts, as in v1
  }
  function validateWrenSave(saved) {
    if (saved !== undefined && !isRecord(saved)) return false;
    if (!saved) return true;
    const allowed = new Set(UNIQUE_WREN_SAVE_KEYS);
    for (const k of Object.keys(saved)) if (!allowed.has(k)) return false;
    for (const k of UNIQUE_WREN_SAVE_KEYS) {
      if (!(k in saved)) continue;
      const value = saved[k];
      if (['maxHealth','health','bombs','maxBombs','potionCharges','rupees','keys','swordDmg'].includes(k)) {
        if (!finite(value)) return false;
      } else if (k === 'potion') {
        if (value !== null && value !== 'red' && value !== 'blue') return false;
      } else if (k === 'bItem') {
        if (typeof value !== 'string' || !Object.prototype.hasOwnProperty.call(ITEMS, value) || ITEMS[value].slot !== 'b') return false;
      } else if (typeof value !== 'boolean') return false;
    }
    return true;
  }
  function validPosition(pos) {
    return isRecord(pos) && int(pos.col) && int(pos.row) && finite(pos.x) && finite(pos.y) &&
      pos.x >= 0 && pos.x <= PLAY_W && pos.y >= 0 && pos.y <= PLAY_H &&
      !!World.get(pos.col, pos.row);
  }
  const VALID_ITEM_IDS = new Set(Object.keys(ITEMS).filter(id => ITEMS[id] && ITEMS[id].slot));
  const VALID_EDGE_IDS = new Set();
  for (let levelId = 1; levelId <= 9; levelId++) for (const edge of Dungeon.level(levelId).edges || []) VALID_EDGE_IDS.add(edge.id);
  function validWorldKey(value) {
    const m = /^(-?\d+),(-?\d+)$/.exec(String(value));
    return !!m && !!World.get(+m[1], +m[2]);
  }
  function validRoomKey(value) {
    const m = /^(\d+):(-?\d+),(-?\d+)$/.exec(String(value));
    return !!m && !!Dungeon.getRoom(Dungeon.level(+m[1]), +m[2], +m[3]);
  }
  function validVisitedScreen(value) {
    if (String(value).startsWith('dungeon:L')) return /^dungeon:L[1-9]$/.test(String(value));
    return validWorldKey(value);
  }
  function validTakenId(value) {
    const id = migrateContentId(value);
    if (VALID_ITEM_IDS.has(id)) return true;
    if (/^boss\d+:-?\d+,-?\d+$/.test(id)) return validRoomKey(id.slice(4));
    if (/^bossheart:L[1-9]$/.test(id) || /^shard[1-9]$/.test(id) || /^fedboomerkin:L[1-9]$/.test(id) || /^elowen:L9$/.test(id)) return true;
    if (/^map:L[1-9]$/.test(id) || /^compass:L[1-9]$/.test(id)) return true;
    if (id.startsWith('cave-')) {
      const rest = id.slice(5), split = rest.lastIndexOf('-');
      return split > 0 && validWorldKey(rest.slice(0, split)) &&
        (VALID_ITEM_IDS.has(rest.slice(split + 1)) || ['doorrepair','gamble'].includes(rest.slice(split + 1)));
    }
    return false;
  }
  function validateIdArray(values, predicate) { return Array.isArray(values) && values.every(predicate); }
  function validateStock(stock) {
    if (!isRecord(stock)) return false;
    return Object.keys(stock).every(key => {
      const split = key.lastIndexOf(':');
      return split > 0 && validWorldKey(key.slice(0, split)) && VALID_ITEM_IDS.has(key.slice(split + 1)) && stock[key] === true;
    });
  }
  function validateCounters(counters) {
    if (!isRecord(counters)) return false;
    const allowed = new Set(['kills','whistleCursor','gambleN','coilwyrmT','questComplete','ngMarker','dungeonEntrances']);
    if (Object.keys(counters).some(k => !allowed.has(k))) return false;
    for (const k of ['kills','whistleCursor','gambleN','coilwyrmT']) if (k in counters && !int(counters[k])) return false;
    for (const k of ['questComplete','ngMarker']) if (k in counters && typeof counters[k] !== 'boolean') return false;
    if ('dungeonEntrances' in counters) {
      if (!isRecord(counters.dungeonEntrances)) return false;
      for (const k of Object.keys(counters.dungeonEntrances)) {
        const entry = counters.dungeonEntrances[k];
        if (!/^([1-9])$/.test(k) || !isRecord(entry) || !int(entry.col) || !int(entry.row) || !Dungeon.getRoom(Dungeon.level(+k), entry.col, entry.row)) return false;
        if (entry.tile !== null && entry.tile !== undefined && (!isRecord(entry.tile) || !int(entry.tile.c) || !int(entry.tile.r))) return false;
      }
    }
    return true;
  }
  function normalizeSecretIds(values) {
    return migrateIds(values).map(s => (s.startsWith('sec:') || s.startsWith('reveal:')) ? s : 'sec:' + s);
  }
  function migrateV1Unlocked(values) {
    if (typeof Dungeon !== 'undefined' && Dungeon.edgeForDoorTile) {
      return values.map(s => Dungeon.edgeForDoorTile(s)).filter(Boolean);
    }
    return values.slice();
  }
  function parseSave(data) {
    if (!isRecord(data) || !int(data.v)) return null;
    const oldWren = migrateWrenRecord(data.wren || data[LEGACY_LINK_FIELD]);
    const oldShards = data.shards === undefined ? data[LEGACY_COUNT_FIELD] : data.shards;
    if (data.v === 1) {
      const legacyTaken = migrateIds(data.taken || []);
      if (!int(data.col) || !int(data.row) || !World.get(data.col, data.row) ||
          !validateWrenSave(oldWren) || !stringArray(data.taken) ||
          !stringArray(data.revealed) || !stringArray(data.unlocked) || !validateIdArray(legacyTaken, validTakenId)) return null;
      if (data.x !== undefined && (!finite(data.x) || data.x < 0 || data.x > PLAY_W)) return null;
      if (data.y !== undefined && (!finite(data.y) || data.y < 0 || data.y > PLAY_H)) return null;
      return {
        version: 1,
        wren: oldWren || {},
        position: { col: data.col, row: data.row, x: numberOrDefault(data.x, 7 * 16), y: numberOrDefault(data.y, 8 * 16) },
        taken: legacyTaken,
        revealed: normalizeSecretIds(data.revealed || []),
        edges: migrateV1Unlocked(data.unlocked || []),
        shards: Math.max(0, Math.min(LUMEN_SHARD_PIECES, Math.round(numberOrDefault(oldShards, 0)))),
        visitedScreens: [], visitedRooms: [], stock: {}, counters: {},
      };
    }
    const position = data.world && data.world.position ? data.world.position :
      (data.position || { col: World.findStart().col, row: World.findStart().row, x: 7 * 16, y: 8 * 16 });
    const questShards = data.quest && (data.quest.shards === undefined ? data.quest[LEGACY_COUNT_FIELD] : data.quest.shards);
    const phase = data.quest && migratePhase(data.quest.phase);
    const counters = data.world && migrateCounters(data.world.counters);
    if (data.v !== 2 || (data.kind !== undefined && data.kind !== 'journey') || !isRecord(data.quest) ||
        !['collecting','level9Open','sableDefeated','rescued'].includes(phase) ||
        !finite(questShards) || !isRecord(data.world) || !isRecord(oldWren) ||
        !validateWrenSave(oldWren) || !validPosition(position) ||
        !stringArray(data.world.taken, false) || !stringArray(data.world.revealed, false) ||
        !stringArray(data.world.visitedScreens, false) || !stringArray(data.world.visitedRooms, false) ||
        !isRecord(data.world.edges) || !validateStock(data.world.stock) || !validateCounters(counters) ||
        !validateIdArray(data.world.taken, validTakenId) || !validateIdArray(data.world.visitedScreens, validVisitedScreen) ||
        !validateIdArray(data.world.visitedRooms, validRoomKey) || !validateIdArray(Object.keys(data.world.edges), id => VALID_EDGE_IDS.has(id))) return null;
    for (const k in data.world.edges) if (data.world.edges[k] !== 'open') return null;
    return {
      version: 2,
      phase,
      wren: oldWren,
      position,
      taken: migrateIds(data.world.taken),
      revealed: normalizeSecretIds(data.world.revealed),
      edges: Object.keys(data.world.edges).filter(k => data.world.edges[k] === 'open'),
      visitedScreens: data.world.visitedScreens,
      visitedRooms: data.world.visitedRooms,
      stock: data.world.stock,
      counters,
      shards: Math.max(0, Math.min(LUMEN_SHARD_PIECES, Math.round(questShards))),
    };
  }
  function readLegacySave() {
    try { return JSON.parse(localStorage.getItem(LEGACY_SAVE_KEY)); } catch (e) { return null; }
  }
  function readSave() {
    const candidates = [KIT_SAVE && KIT_SAVE.get(null), readLegacySave()];
    for (const candidate of candidates) {
      const parsed = parseSave(candidate);
      if (parsed) return parsed;
    }
    return null;
  }
  function loadGame() {
    const save = readSave();
    if (!save) { startGame(); return false; }
    startGame();   // fresh baseline, then overlay the save
    const l = state.wren;
    for (const k of UNIQUE_WREN_SAVE_KEYS) if (k in save.wren) l[k] = save.wren[k];
    clampWren(l);
    state.cleared = new Set();                        // per-visit only
    state.taken = new Set(save.taken);
    state.revealed = new Set(save.revealed);
    state.worldEdges = {};
    save.edges.forEach(u => { state.worldEdges[u] = 'open'; });
    state.edgeState = {};
    state.visitedScreens = new Set(save.visitedScreens);
    state.visitedRooms = new Set(save.visitedRooms);
    state.stock = Object.assign({}, save.stock);
    state.counters = Object.assign({}, save.counters);
    state.shards = save.shards;
    state.quest = { phase: save.phase || 'collecting', shards: state.shards };
    const p = save.position;
    loadOverworld(p.col, p.row, [p.x, p.y]);
    return true;
  }

  // ---------- callbacks from entities ----------
  state.solidAt = solidAt;
  state.solidFor = solidFor;
  state.spawn = (e) => state.entities.push(e);
  state.rupeePopup = (text, x, y) => state.rupeePopups.push({ text, x:x === undefined ? state.wren.x : x, y:y === undefined ? state.wren.y : y, t:42 });
  state.showMsg = (text, frames) => showMsg(text, frames);
  state.saveGame = () => saveGame();
  state.closePack = () => { if (state.mode === 'pack') state.mode = state.prevMode; };
  state.collect = (it) => resolveItemTouch(state, it);
  state.onEnemyKilled = (e) => onEnemyKilled(e);
  state.onBossKilled = (e) => onBossKilled(e);
  state.onBombBlast = (cx, cy) => onBombBlast(cx, cy);
  state.onWhistle = () => {
    if (state.mode !== 'overworld') return false;
    const id = 'sec:' + state.col + ',' + state.row;
    if (state.col === 5 && state.row === 5) {
      if (!state.revealed.has(id)) {
        state.revealed.add(id);
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (state.grid[r][c] === 'W') state.grid[r][c] = '.';
        state.grid[5][7] = 'S'; state.screenImg = bakeScreen(state.grid, state.theme);
        showMsg('THE POND DRAINS. STAIRS APPEAR!', 180); saveGame();
      }
      return true;
    }
    const sc = World.get(state.col, state.row);
    if (sc && sc.hiddenDungeon && !state.revealed.has(id) &&
        (!sc.dungeon || sc.dungeon.level !== 9 || ['level9Open','sableDefeated','rescued'].includes(state.quest.phase))) {
      state.revealed.add(id); state.grid[5][7] = 'D'; state.screenImg = bakeScreen(state.grid, state.theme);
      showMsg('A HIDDEN ENTRANCE AWAKENS!', 180); saveGame(); return true;
    }
    return false;
  };
  function revealL9Entrance() {
    if (state.mode !== 'overworld' || state.col !== 8 || state.row !== 0 ||
        !['level9Open','sableDefeated','rescued'].includes(state.quest.phase) || state.revealed.has('sec:8,0')) return false;
    state.revealed.add('sec:8,0');
    if (state.grid[5] && state.grid[5][7] !== 'D') state.grid[5][7] = 'D';
    state.screenImg = bakeScreen(state.grid, state.theme);
    Sound.SFX.secret(); Sound.SFX.stairs(); showMsg('ASHEN PEAK OPENS!', 180); saveGame();
    return true;
  }
  state.warpToVisitedDungeon = () => {
    const entries = state.counters.dungeonEntrances || {};
    const levels = Object.keys(entries).map(Number).filter(Number.isFinite).sort((a,b)=>a-b);
    if (!levels.length) return false;
    const current = state.level ? state.level.id : (Number(state.counters.whistleCursor) || 0);
    const next = levels.find(n => n > current) || levels[0], ent = entries[next];
    if (!ent) return false;
    state.cave = null;
    loadOverworld(ent.col, ent.row, null);
    const pos = ent.tile ? freeBelow(ent.tile.c, ent.tile.r + 1) : [7*16,8*16];
    state.wren.x = pos[0]; state.wren.y = pos[1]; state.wren.dir = 'up'; state.counters.whistleCursor = next; saveGame(); return true;
  };
  state.onHungryBoomerkin = (e) => {
    if (state.level && state.wren.hasBait) {
      state.wren.hasBait = false; state.taken.add('fedboomerkin:L' + state.level.id); e.alive = false;
      if (state.grid[5] && state.grid[5][7] === 'B') state.grid[5][7] = 'F';
      const room = Dungeon.getRoom(state.level, state.col, state.row);
      state.cleared.add(key3('d' + state.level.id, state.col, state.row));
      state.screenImg = bakeScreen(state.grid, state.theme); Sound.SFX.secret();
      if (room) spawnRoomItem(room, state.level.id, state.col, state.row);
      saveGame();
    } else showDialog({pages:['THE OLD ONE MUTTERS AND WILL NOT MOVE.']});
  };
  state.onGriphandGrab = (e) => {
    if (state.mode !== 'dungeon' || e.grabbed) return;
    e.grabbed = true;
    state.showMsg('THE GRASPER SEIZES WREN!', 100);
    const entry = state.level.entry;
    loadDungeonRoom(entry.col, entry.row, [entry.pos[0] * 16, entry.pos[1] * 16]);
  };
  state.onWrenDead = () => {
    clearHoist(); state.lowHealthT = 0;
    if (KIT_SAVE) KIT_SAVE.set({ kind:'best', v:2, bestShards: bestShards() });
    state.mode = 'gameover'; state.msgT = 180; Sound.SFX.die(); Sound.stopMusic();
  };

  function resolveItemTouch(gameState, it) {
    if (it.item === 'gamble') {
      if (gameState.wren.rupees < 10) {
        if (!it._refusedTouch) { it._refusedTouch = true; showMsg("COIN FIRST, TRAVELLER.", 150); }
        return 'refused';
      }
      const n = gameState.counters.gambleN || 0;
      gameState.counters.gambleN = n + 1;
      const outcomes = [-10, 20, 50];
      const amount = outcomes[(n + (it._gambleIndex || 0)) % 3];
      gameState.wren.rupees = Math.max(0, Math.min(ITEMS.caps.rupees, gameState.wren.rupees + amount));
      gameState.taken.add(caveUnique('gamble'));
      for (const e of gameState.entities) if (e._gambleIndex !== undefined) e.alive = false;
      showMsg(amount < 0 ? 'YOU LOST 10 GLIMS.' : '+' + amount + ' GLIMS!', 180);
      saveGame();
      return 'taken';
    }
    if (it._unique && gameState.taken.has(it._unique)) { it.alive = false; return 'kept'; }
    const def = ITEMS[it.item];
    if (!def) return 'kept';
    if (it.oneTime && it._stockKey && gameState.stock[it._stockKey]) return 'kept';
    if (it.price && gameState.wren.rupees < it.price) {
      if (!it._refusedTouch) { it._refusedTouch = true; showMsg("COIN FIRST, TRAVELLER.", 150); }
      return 'refused';
    }
    it._refusedTouch = false;
    const result = def.onCollect ? def.onCollect(gameState.wren, gameState, it) : undefined;
    if (result === 'refused') return 'refused';
    if (result === 'kept') return 'kept';
    if (it.price) { gameState.wren.rupees -= it.price; Sound.SFX.rupee(); }
    if (it.oneTime && it._stockKey) gameState.stock[it._stockKey] = true;
    if (it._unique) { gameState.taken.add(it._unique); saveGame(); }
    else if (it.price || it.oneTime) saveGame();
    const major = (def.slot === 'gear' || (def.slot === 'b' && it.item !== 'bomb') ||
      it.item === 'heartcontainer' || it.item === 'shard');
    if (major && gameState.wren.health > 0) {
      gameState.wren.hoist = 32;
      gameState.wren.hoistItem = it.item;
    }
    return 'taken';
  }
  function collect(it) { return resolveItemTouch(state, it); }

  function onEnemyKilled(e) {
    state.entities.push(E.makeFx('poof', e.x, e.y));   // death poof
    if (e.boss || e.noDrops) return;
    const group = e.dropClass || ({
      stonepeeper:'minor', glimmerbat:'minor', gel:'minor', rushcoil:'minor', sandburrow:'minor', springclaw:'minor',
      mossbrute:'mid', boomerkin:'mid', boneguard:'mid', reedripper:'mid', slimelet:'mid',
      cinderhorn:'elite', nightwarden:'elite', ironwarden:'elite', veilcaster:'elite',
    })[e.etype];
    if (!group) return;
    const kills = (state.counters.kills || 0) + 1;
    state.counters.kills = kills;
    const forceBomb = kills % 16 === 0 && state.wren.bombs <= 0;
    const forceDrop = kills % 10 === 0;
    if (!forceBomb && !forceDrop && state.rand() >= 0.40) return;
    let kind;
    if (forceBomb) kind = 'bomb';
    else if ((group === 'mid' || group === 'elite') && state.rand() < 0.03) kind = 'fairy';
    else {
      const roll = state.rand();
      if (group === 'minor') kind = roll < 0.55 ? 'heart' : 'rupee';
      else if (group === 'mid') kind = roll < 0.40 ? 'heart' : roll < 0.78 ? 'rupee' : 'bomb';
      else kind = roll < 0.45 ? 'rupee5' : roll < 0.75 ? 'bomb' : 'heart';
    }
    state.entities.push(E.makeItem(kind, e.x + 1, e.y + 1, { life: 380 }));
    // screen clear bookkeeping (defer to update)
  }
  function onBossKilled(e) {
    const lvl = state.level;
    state.taken.add(key3('boss' + lvl.id, state.col, state.row));
    Sound.SFX.secret();
    if (e.etype === 'sable') {
      state.quest.phase = 'sableDefeated';
      state.cleared.add(key3('d' + lvl.id, state.col, state.row));
      openCondition('sable');
      saveGame();
      showMsg('SABLE IS UNMADE. FREE ELOWEN.', 240);
      return;
    }
    // drop heart container, then shard appears
    const heart = E.makeItem('heartcontainer', 4 * 16, 5 * 16, { permanent: true });
    heart._unique = 'bossheart:L' + lvl.id;
    state.entities.push(heart);
    const rd = Dungeon.getRoom(lvl, state.col, state.row);
    if (rd.shard) {
      const it = E.makeItem('shard', rd.shard.x * 16, rd.shard.y * 16, { permanent: true });
      it._unique = 'shard' + lvl.id;
      state.entities.push(it);
    }
  }

  // ---------- sword melee ----------
  function swordRect() {
    const l = state.wren;
    switch (l.dir) {
      case 'right': return { x: l.x + 11, y: l.y + 5, w: 15, h: 7 };
      case 'left':  return { x: l.x - 10, y: l.y + 5, w: 15, h: 7 };
      case 'up':    return { x: l.x + 5, y: l.y - 10, w: 7, h: 15 };
      case 'down':  return { x: l.x + 5, y: l.y + 11, w: 7, h: 15 };
    }
  }
  function doSwordHits() {
    if (state.swordSwung <= 0) return;
    const sword = swordRect(), lx = state.wren.x + 8, ly = state.wren.y + 8;
    for (const en of state.entities) {
      if (en.kind !== 'enemy' || en.alive === false ||
          ((en.hidden || en.invulnerable) && en.etype !== 'sable')) continue;
      if (state.swordHitSet.has(en)) continue;
      let hit = null;
      if (en.segments) {
        for (const s of en.segments) {
          if (s.hp > 0 && E.overlap(sword, { x:s.x, y:s.y, w:14, h:14 })) {
            hit = { x:s.x + 7, y:s.y + 7 }; break;
          }
        }
      } else if (E.overlap(sword, E.hitbox(en))) hit = { x:lx, y:ly };
      if (hit) {
        state.swordHitSet.add(en);
        en.hurt(state, state.wren.swordDmg || 1, hit.x, hit.y);
      }
    }
  }

  // ---------- unlock locked doors ----------
  function tryUnlock() {
    const l = state.wren;
    if (l.keys <= 0 && !l.hasMagicKey) return;
    const cx = l.x + 8, cy = l.y + 8;
    let fx = cx, fy = cy;
    if (l.dir === 'left') fx = l.x - 2; if (l.dir === 'right') fx = l.x + 18;
    if (l.dir === 'up') fy = l.y - 2; if (l.dir === 'down') fy = l.y + 18;
    const t = tileAtPx(fx, fy);
    if (t && t.ch === 'L') {
      const edge = edgeForRoomTile(state.level, state.col, state.row, t.c, t.r);
      if (!edge) return;
      state.edgeState[edge.id] = 'open';
      if (edge.type === 'locked') state.worldEdges[edge.id] = 'open';
      applyDoorState(state.level, state.col, state.row);
      if (!l.hasMagicKey) l.keys--;
      Sound.SFX.secret();
    }
  }

  // ---------- update ----------
  function update() {
    if (state.bannerT > 0) state.bannerT--;
    for (const p of state.rupeePopups) { p.t--; p.y--; }
    state.rupeePopups = state.rupeePopups.filter(p => p.t > 0);
    const P = Engine.pressed;
    if (P.mute) { Sound.toggleMute(); state.muteFlash = 60; }

    if (state.wren && state.wren.health > 0 && state.wren.health <= 2 &&
        (state.mode === 'overworld' || state.mode === 'dungeon' || state.mode === 'cave')) {
      state.lowHealthT++;
      if (state.lowHealthT >= 45) { state.lowHealthT = 0; Sound.SFX.lowbeat(); Sound.SFX.danger(); }
    } else state.lowHealthT = 0;

    if (state.mode === 'title') {
      if (P.start || P.a) { Sound.ensure(); startGame(); }
      return;
    }
    if (state.mode === 'gameover') {
      if (P.start || P.a) { startGame(); }
      if (state.msgT > 0) state.msgT--;
      return;
    }
    if (state.mode === 'ending') {
      state.flashEnding++;
      if ((P.start || P.a) && state.flashEnding > 120) { state.flashEnding = 0; startGame(); }
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
      if (s.t >= s.max) { s.finalize(); state.mode = state.prevMode === 'dungeon' ? 'dungeon' : (state.level ? 'dungeon' : 'overworld'); state.scroll = null; saveGame(); }
      return;
    }
    if (state.dialogue) {
      const d = state.dialogue, page = d.pages[d.index] || {};
      const choices = page && page.choices;
      if (choices && choices.length) {
        if (P.left) d.choice = (d.choice + choices.length - 1) % choices.length;
        if (P.right) d.choice = (d.choice + 1) % choices.length;
        if (P.a) {
          if (d.onChoose) d.onChoose(choices[d.choice].value);
          const done = d.onDone; state.dialogue = null; state.msg = null; state.msgT = 0;
          if (done) done();
        }
      } else if (P.a) {
        if (d.index + 1 < d.pages.length) { d.index++; d.choice = 0; setDialogPage(); }
        else {
          const done = d.onDone; state.dialogue = null; state.msg = null; state.msgT = 0;
          if (done) done();
        }
      }
      return;
    }
    if (state.mode === 'pack') {
      updatePack();
      return;
    }

    // playing modes: overworld / dungeon / cave
    if (P.start) {   // inventory overlay; it is deliberately non-pausing
      state.prevMode = state.mode;
      state.mode = 'pack';
      state.pauseIcons = buildPauseIcons();
      state.pauseSel = Math.max(0, state.pauseIcons.bIds.indexOf(state.wren.bItem));
      Sound.SFX.select();
      return;
    }
    // B-item quick cycle
    if (P.select) cycleItem();

    if (tryStartRaftRide()) return;
    state.wren.update(state);
    if (state.wren.moving && state.wren.animTimer === 0) {
      const underfoot = tileAtPx(state.wren.x + 8, state.wren.y + 14);
      Sound.SFX.step(underfoot && underfoot.ch === 'W' ? 'water' : state.mode === 'dungeon' || state.mode === 'cave' ? 'stone' : 'grass');
    }
    state.swordSwung = Math.max(0, state.swordSwung - 1);
    doSwordHits();
    if (state.mode === 'dungeon') {
      tryUnlock(); tryPush();
      // a flame lights a dark room for the rest of the visit
      if (state.dark && state.entities.some(e => e.kind === 'proj' && (e.ptype === 'flame' || e.ptype === 'fireblast'))) {
        state.dark = false;
        state.lit.add(key3('d' + state.level.id, state.col, state.row));
        Sound.SFX.secret();
      }
    } else if (state.mode === 'overworld') tryPush();

    // update entities (freshly spawned enemies materialize behind a puff)
    for (const e of state.entities) {
      if (e.alive === false) continue;
      if (e._spawnDelay > 0) { e._spawnDelay--; continue; }
      if (e.update) e.update(state);
    }

    // secrets: flames burn marked trees; (bomb reveals hook via onBombBlast)
    if (state.mode === 'overworld') checkBurnSecrets();

    // deferred dungeon exit after collecting a non-final LumenShard piece
    if (state._warpOut) { state._warpOut = false; exitDungeon(); return; }

    // remove dead
    state.entities = state.entities.filter(e => e.alive !== false);

    // room-clear bookkeeping (dungeon rooms stay cleared for THIS visit;
    // overworld enemies always respawn on re-entry). NOTE: uses a had-enemies
    // flag — comparing counts before/after the filter never fired because dead
    // enemies were already excluded from both counts.
    if (state.mode === 'dungeon' && state._hadEnemies && countEnemies() === 0) {
      state._hadEnemies = false;
      const roomKey = key3('d' + state.level.id, state.col, state.row);
      state.cleared.add(roomKey);
      const rd = Dungeon.getRoom(state.level, state.col, state.row);
      if (rd && rd.room.shutter === 'clear') openCondition('clear');
      if (rd && rd.item && rd.item.guarded && spawnRoomItem(rd, state.level.id, state.col, state.row)) {
        Sound.SFX.secret(); saveGame();
      }
    }

    // triggers (cave/dungeon entrances)
    if (state.mode === 'overworld') {
      revealL9Entrance();
      const t = tileAtPx(state.wren.x + 8, state.wren.y + 10);
      if (!t || t.ch !== 'D') state._raftGateTile = null;
      if (t) {
        const sc = World.get(state.col, state.row);
        const caveKind = caveKindAt(sc, t);
        if (t.ch === 'C' && caveKind) enterCave(caveKind, t);
        else if (t.ch === 'S' && caveKind) enterCave(caveKind || 'shop', t);
        else if (t.ch === 'D' && sc.dungeon) enterDungeon(sc.dungeon.level, t);
      }
    }

    checkEdge();
    if (state.msgT > 0 && state.msgT < 99999) state.msgT--;
  }

  // ---------- push blocks ----------
  function tryPush() {
    const l = state.wren;
    if (!l.moving) { state._pushT = 0; return; }
    const [dx, dy] = E.DIRS[l.dir];
    const t = tileAtPx(l.x + 8 + dx * 12, l.y + 8 + dy * 12);
    if (!t) { state._pushT = 0; return; }
    if (state.mode === 'overworld') {
      if (t.ch !== 'G' && t.ch !== 'A') { state._pushT = 0; return; }
      const sc = World.get(state.col, state.row), secret = sc && sc.secret, pos = secret && secret.tile;
      if (!secret || secret.interaction !== 'push' || !pos || pos.c !== t.c || pos.r !== t.r) { state._pushT = 0; return; }
      if (secret.requires === 'powerbracelet' && !l.hasPowerBracelet) {
        state._pushT = 0;
        if (state.msgT <= 0) showMsg('THE BOULDER WILL NOT BUDGE.', 90);
        return;
      }
      if (++state._pushT < 18) return;
      state._pushT = 0;
      revealSecret(t, 'S');
      return;
    }
    if (t.ch !== 'p') { state._pushT = 0; return; }
    if (++state._pushT < 18) return;                    // shove for ~1/3 second
    state._pushT = 0;
    const nc = t.c + dx, nr = t.r + dy;
    const dest = (nr >= 0 && nr <= 10 && nc >= 0 && nc <= 15) ? state.grid[nr][nc] : null;
    if (dest !== 'F') return;                           // nowhere to slide
    state.grid[t.r][t.c] = 'F';
    state.grid[nr][nc] = 'B';                           // block rests one tile over
    const roomKey = key3('d' + state.level.id, state.col, state.row);
    state.pushed.add(roomKey);
    state.screenImg = bakeScreen(state.grid, state.theme);
    Sound.SFX.secret();
    const rd = Dungeon.getRoom(state.level, state.col, state.row);
    if (rd && rd.room.shutter === 'push') openCondition('push');
    if (rd && rd.item && rd.item.guarded && spawnRoomItem(rd, state.level.id, state.col, state.row)) {
      Sound.SFX.secret(); saveGame();
    }
  }

  // ---------- secrets ----------
  function revealSecret(t, becomes) {
    state.grid[t.r][t.c] = becomes;
    state.revealed.add('sec:' + state.col + ',' + state.row);
    state.screenImg = bakeScreen(state.grid, state.theme);
    Sound.SFX.secret();
    showMsg("A SECRET IS REVEALED!", 160);
    saveGame();
  }
  // bombs crack open marked walls ('H' -> cave)
  function onBombBlast(cx, cy) {
    if (state.mode === 'dungeon' && state.level) {
      for (const edge of state.level.edges || []) {
        if (edge.type !== 'bomb' || state.worldEdges[edge.id] === 'open') continue;
        const roomKey = state.col + ',' + state.row;
        for (const [c,r] of Dungeon.doorTiles(edge, roomKey)) {
          if (Math.abs(cx - (c * 16 + 8)) <= 24 && Math.abs(cy - (r * 16 + 8)) <= 24) {
            state.worldEdges[edge.id] = 'open'; state.edgeState[edge.id] = 'open';
            applyDoorState(state.level, state.col, state.row); Sound.SFX.secret(); saveGame(); return;
          }
        }
      }
      return;
    }
    if (state.mode !== 'overworld') return;
    const sc = World.get(state.col, state.row), secret = sc && sc.secret, pos = secret && secret.tile;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const t = tileAtPx(cx + dc * 16, cy + dr * 16);
      if (t && t.ch === 'H' && pos && t.c === pos.c && t.r === pos.r) { revealSecret(t, 'C'); return; }
    }
  }
  // candle / fire-rod flames burn marked trees ('U' -> stairs)
  function checkBurnSecrets() {
    const sc = World.get(state.col, state.row), secret = sc && sc.secret, pos = secret && secret.tile;
    for (const p of state.entities) {
      if (p.kind !== 'proj' || (p.ptype !== 'flame' && p.ptype !== 'fireblast')) continue;
      const t = tileAtPx(p.x + p.w / 2, p.y + p.h / 2);
      const ahead = tileAtPx(p.x + p.w / 2 + p.vx * 10, p.y + p.h / 2 + p.vy * 10);
      for (const tt of [t, ahead]) {
        if (tt && tt.ch === 'U' && pos && tt.c === pos.c && tt.r === pos.r) { revealSecret(tt, 'S'); return; }
      }
    }
  }

  // ---------- pause / inventory ----------
  function ownedBItems() {
    const l = state.wren;
    return Object.keys(ITEMS).filter(id => ITEMS[id].slot === 'b' &&
      (!ITEMS[id].flag || l[ITEMS[id].flag]));
  }
  function updatePack() {
    const P = Engine.pressed;
    if (P.start) { state.mode = state.prevMode; Sound.SFX.select(); return; }
    const owned = state.pauseIcons.bIds;
    if (P.left)  { state.pauseSel = (state.pauseSel + owned.length - 1) % owned.length; Sound.SFX.select(); }
    if (P.right) { state.pauseSel = (state.pauseSel + 1) % owned.length; Sound.SFX.select(); }
    if (P.a || P.select) {
      state.wren.bItem = owned[state.pauseSel];
      Sound.SFX.item();
    }
  }

  function cycleItem() {
    const l = state.wren;
    const owned = ownedBItems();
    const i = owned.indexOf(l.bItem);
    l.bItem = owned[(i + 1) % owned.length];
    Sound.SFX.select();
  }

  function makePauseIcon(id) {
    const def = ITEMS[id];
    if (def && def.icon) return { id, draw: (ctx, x, y) => def.icon(ctx, x, y) };
    const item = E.makeItem(id, 0, 0, { permanent: true });
    return { id, draw(ctx, x, y) { item.x = x; item.y = y; item.draw(ctx, 0, 0); } };
  }
  function buildPauseIcons() {
    const bIds = ownedBItems(), gearIds = [], l = state.wren;
    if (l.hasSword) gearIds.push(l.hasMagicSword ? 'magicsword' : l.hasWhiteSword ? 'whitesword' : 'sword');
    for (const id of ['shield','magicshield','bait','ring','redring','stepladder','raft','powerbracelet','magickey','silverarrows']) {
      const def = ITEMS[id];
      if (def.slot === 'gear' && def.flag && l[def.flag] && !gearIds.includes(id)) gearIds.push(id);
    }
    return { bIds, b: bIds.map(makePauseIcon), gear: gearIds.map(makePauseIcon) };
  }

  function clearPersistedJourney() {
    const best = bestShards();
    if (KIT_SAVE) {
      KIT_SAVE.clear();
      if (best > 0) KIT_SAVE.set({ kind: 'best', v: 2, bestShards: best });
    }
    try { localStorage.removeItem(LEGACY_SAVE_KEY); } catch (e) {}
  }
  function restartJourney() {
    clearPersistedJourney();
    startGame();
  }
  function startGame() {
    Engine.clearInput();
    // reset wren + world
    const st = World.findStart();
    state.wren = E.makeWren(st.screen.startPos[0] * 16, st.screen.startPos[1] * 16);
    state.cleared = new Set(); state.taken = new Set(); state.worldEdges = {}; state.edgeState = {};
    state.revealed = new Set(); state.pushed = new Set(); state.lit = new Set();
    state.dark = false;
    state.level = null; state.cave = null; state.scroll = null;
    state.msg = null; state.msgT = 0; state.dialogue = null; state.shards = 0;
    state._raftGateTile = null;
    state._raftRide = null;
    state.raftRide = null;
    state.pauseIcons = null;
    state.quest = { phase: 'collecting', shards: 0 };
    state.visitedScreens = new Set(); state.visitedRooms = new Set();
    state.stock = {}; state.counters = {}; state.rupeePopups = [];
    state.lowHealthT = 0;
    state.flashWin = 0; state.flashEnding = 0;
    loadOverworld(st.col, st.row, [st.screen.startPos[0] * 16, st.screen.startPos[1] * 16]);
    state.mode = 'overworld';
    Sound.playTrack('overworld');
  }

  // ---------- boot ----------
  function init() {
    Sprites.init();
    state.wren = E.makeWren(7 * 16, 8 * 16);
    // Boot straight into play: resume a save if there is one, else new game.
    try { if (!(hasSave() && loadGame())) startGame(); } catch (e) { startGame(); }
    Engine.run(update);
  }

  return { init, state, solidFor, solidAt,
    // test hooks (harmless; enable headless integration testing)
    _test: { loadOverworld, loadDungeonRoom, enterDungeon, enterCave, exitCave, exitDungeon, startGame, restartJourney, collect, resolveItemTouch, saveGame, loadGame, hasSave, showDialog, update, startRaftRide, tryStartRaftRide, tryPush, CAVES, LUMEN_SHARD_PIECES } };
})();
