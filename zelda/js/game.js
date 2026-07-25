/* game.js — state machine, screen/room management, HUD, caves, combat glue. */

const Game = (() => {
  const E = Entities;
  const TRIFORCE_PIECES = 8;
  // `dbg` is an optional on-screen debug logger defined by index.html. Fall back
  // to a no-op so the game boots in any host (tests, embeds) that lacks it.
  const dbg = (typeof window !== 'undefined' && window.dbg) ? window.dbg : function(){};

  const state = {
    mode: 'title',        // title | overworld | dungeon | cave | scroll | gameover | win | ending
    prevMode: 'overworld',
    col: 0, row: 0,
    level: null,
    grid: null, theme: 'over',
    screenImg: null,
    entities: [],
    link: null,
    swordSwung: 0,
    swordSwingId: 0,
    swordHitSet: new Set(),
    keys: Engine.keys, pressed: Engine.pressed,
    rand: Engine.rand, randInt: Engine.randInt, choice: Engine.choice,
    cleared: new Set(),       // dungeon rooms cleared THIS visit (resets on exit)
    taken: new Set(),         // unique items collected (bow, boomerang, triforce...)
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
    triforces: 0,
    TRIFORCE_PIECES,
    quest: { phase: 'collecting', triforces: 0 },
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

  const screenPool = [];
  const DUNGEON_SCREEN_LEVELS = {};
  for (const k in World.CFG) if (World.CFG[k].dungeon) DUNGEON_SCREEN_LEVELS[k] = World.CFG[k].dungeon.level;
  function bakeScreen(grid, theme) {
    let c = state.screenImg;
    if (!c || state._bakeNext) {
      let index = c ? screenPool.indexOf(c) : -1;
      if (index < 0) index = screenPool.length;
      if (state._bakeNext) index = (index + 1) % 3;
      c = screenPool[index] || (screenPool[index] = document.createElement('canvas'));
    }
    c.width = PLAY_W; c.height = PLAY_H;
    const x = c.getContext('2d');
    x.fillStyle = '#000'; x.fillRect(0, 0, PLAY_W, PLAY_H);
    const tileTheme = Tiles.levelTheme(theme, state.mode === 'dungeon' && state.level ? state.level.id : 0);
    for (let r = 0; r < ROWS; r++) {
      for (let col = 0; col < COLS; col++) {
        const ch = grid[r][col];
        Tiles.blit(x, tileTheme, ch, col * 16, r * 16);
      }
    }
    return c;
  }

  function solidFor(entity, px, py) {
    const c = Math.floor(px / 16), r = Math.floor(py / 16);
    if (c < 0 || c > 15 || r < 0 || r > 10) return false;   // off-edge = walk-through (triggers transition)
    const ch = state.grid[r][c];
    if (entity && entity.kind === 'enemy' && ['keese', 'tektite', 'peahat'].includes(entity.etype)) return false;
    if (entity && entity.kind === 'link' && ch === 'W' && entity.hasStepladder) {
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
  function solidAt(px, py, entity) { return solidFor(entity || state.link, px, py); }

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
        (!sc.dungeon || sc.dungeon.level !== 9 || ['level9Open','ganonDefeated','rescued'].includes(state.quest.phase))) state.grid[5][7] = 'D';
    if (col === 5 && row === 5 && state.revealed.has('sec:5,5')) {
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (state.grid[r][c] === 'W') state.grid[r][c] = '.';
      state.grid[5][7] = 'S';
    }
    state.screenImg = bakeScreen(state.grid, state.theme);
    state.entities = [];
    // enemies respawn on every screen entry (authentic Zelda 1 behavior —
    // the world never goes permanently quiet)
    if (sc.enemies) for (const [t, v, tx, ty] of sc.enemies) spawnEnemy(t, v, tx, ty);
    if (entryPos) { state.link.x = entryPos[0]; state.link.y = entryPos[1]; }
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
      if (b.variant === 'gleeok')        state.entities.push(E.makeGleeok(b.x, b.y, o));
      else if (b.variant === 'dodongo')  state.entities.push(E.makeDodongo(b.x, b.y, o));
      else if (b.variant === 'manhandla')state.entities.push(E.makeManhandla(b.x, b.y, o));
      else if (b.variant === 'gohma')    state.entities.push(E.makeGohma(b.x, b.y, o));
      else if (b.variant === 'digdogger')state.entities.push(E.makeDigdogger(b.x, b.y, o));
      else if (b.variant === 'ganon')    state.entities.push(E.makeGanon(b.x, b.y, o));
      else state.entities.push(E.makeAquamentus(b.x, b.y, { variant: b.variant }));
    }
    if (rd.boss && rd.boss.variant !== 'ganon' && state.taken.has(key3('boss' + lvl.id, col, row)) &&
        !state.taken.has('bossheart:L' + lvl.id)) {
      const heart = E.makeItem('heartcontainer', 4 * 16, 5 * 16, { permanent: true });
      heart._unique = 'bossheart:L' + lvl.id;
      state.entities.push(heart);
    }
    Sound.playTrack(lvl.id === 9 && rd.boss && rd.boss.variant === 'ganon' ? 'ganon' : lvl.id === 9 ? 'level9' : 'dungeon');
    if (rd.room.goriyaGate && !state.taken.has('fedgoriya:L' + lvl.id)) spawnEnemy('hungrygoriya', null, 7, 4);
    spawnRoomItem(rd, lvl.id, col, row);
    if (rd.triforce && state.taken.has(key3('boss' + lvl.id, col, row)) && !state.taken.has('triforce' + lvl.id)) {
      const it = E.makeItem('triforce', rd.triforce.x * 16, rd.triforce.y * 16, { permanent: true });
      it._unique = 'triforce' + lvl.id;
      state.entities.push(it);
    }
    state._hadEnemies = countEnemies() > 0;   // arms the room-clear/shutter check
    if (entryPos) { state.link.x = entryPos[0]; state.link.y = entryPos[1]; }
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
    if (edge.condition && edge.condition.kind === 'ganon' &&
        (state.quest.phase === 'ganonDefeated' || state.quest.phase === 'rescued')) return 'open';
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
    if (rd.item.kind === 'zelda') return state.quest.phase === 'ganonDefeated' && !state.taken.has('zelda:L9');
    const unique = (rd.item.kind === 'map' || rd.item.kind === 'compass') ? rd.item.kind + ':L' + lvlId : key3('item' + lvlId, col, row);
    if (state.taken.has(unique)) return false;
    if (rd.item.requiresClear) {
      const [rc, rr] = rd.item.requiresClear.split(',').map(Number);
      return state.cleared.has(key3('d' + lvlId, rc, rr));
    }
    if (!rd.item.guarded) return true;
    if (rd.room.goriyaGate && !state.taken.has('fedgoriya:L' + lvlId)) return false;
    if (rd.room.goriyaGate) return true;
    const rk = key3('d' + lvlId, col, row);
    if (rd.room.shutter === 'push') return state.pushed.has(rk);
    return state.cleared.has(rk);
  }
  function spawnRoomItem(rd, lvlId, col, row) {
    if (!roomItemReady(rd, lvlId, col, row)) return false;
    const it = E.makeItem(rd.item.kind, rd.item.x * 16, rd.item.y * 16, { permanent: true });
    it._unique = (rd.item.kind === 'map' || rd.item.kind === 'compass')
      ? rd.item.kind + ':L' + lvlId : rd.item.kind === 'zelda' ? 'zelda:L9' : key3('item' + lvlId, col, row);
    it._level = lvlId;
    state.entities.push(it); return true;
  }

  function countEnemies() {
    return state.entities.filter(e => e.kind === 'enemy' && e.alive !== false && e.countsForClear !== false).length;
  }

  function clearHoist() {
    if (!state.link) return;
    state.link.hoist = 0;
    state.link.hoistItem = null;
  }

  // ---------- transitions ----------
  function startScroll(dir, ncol, nrow, loader) {
    clearHoist();
    const fromImg = state.screenImg;
    // pre-load target into a temp by swapping grid; bake; then restore for animation
    const savedGrid = state.grid, savedImg = state.screenImg, savedTheme = state.theme,
          savedCol = state.col, savedRow = state.row, savedEnts = state.entities;
    state._bakeNext = true;
    loader();   // mutates state to new screen (entities for new screen created but we hold them)
    state._bakeNext = false;
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

  const RAFT_ROUTES = Object.freeze({
    '5,5:right': { col:6, row:5, x:7*16, y:5*16 },
    '6,5:left':  { col:5, row:5, x:7*16, y:5*16 },
    '7,5:right': { col:8, row:5, x:7*16, y:5*16 },
    '8,5:left':  { col:7, row:5, x:7*16, y:5*16 },
  });
  function startRaftRide(dir, ncol, nrow, targetPos) {
    const fromImg = state.screenImg;
    const linkFrom = { x:state.link.x, y:state.link.y };
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
      dir, t:0, max:44, raft:true, fromImg, toImg,
      linkFrom, linkTo:{x:targetPos[0], y:targetPos[1]},
      finalize() {
        state.col = newCol; state.row = newRow; state.grid = newGrid; state.theme = newTheme;
        state.screenImg = toImg; state.entities = newEnts; state.mode = 'overworld';
        state.link.x = targetPos[0]; state.link.y = targetPos[1]; state.link.knock = null; state._raftRide = null; state.raftRide = null;
      }
    };
    state.prevMode = 'overworld'; state.mode = 'scroll';
    state._raftRide = state.raftRide = { dir, from: savedCol + ',' + savedRow, to:ncol + ',' + nrow };
  }
  function tryStartRaftRide() {
    if (state.mode !== 'overworld' || !state.link || !state.link.hasRaft) return false;
    const t = tileAtPx(state.link.x + 8, state.link.y + 8);
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
      if (World.get(nc, nr) && World.edgeOpen(state.col, state.row, nc, nr)) startScroll(dir, nc, nr, () => loadOverworld(nc, nr));
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
  const DUNGEON_NAMES = {1:'EAGLE',2:'MOON',3:'MANJI',4:'SNAKE',5:'LIZARD',6:'DRAGON',7:'DEMON',8:'CROWN',9:"DEATH'S CROWN"};
  const CAVES = {
    sword: { item:'sword', message:"IT'S DANGEROUS TO GO ALONE! TAKE THIS.", repeat:'MASTER USING IT AND YOU CAN HAVE THIS.' },
    ring: { item:'ring', message:'THE BLUE RING. IT EASES YOUR PAIN.', repeat:'IT SUITS YOU WELL.' },
    candle: { item:'candle', message:'TAKE THE CANDLE. LIGHT THE DARK!', repeat:'COME BACK ANY TIME.' },
    shopA: { greet:"WELCOME, BUY SOMETHIN'!", wares:[
      {item:'magicshield',price:130,oneTime:true},{item:'key',price:100,oneTime:true},{item:'ring',price:250,oneTime:true}] },
    shopB: { greet:'TAKE YOUR PICK!', wares:[
      {item:'candle',price:60,oneTime:true},{item:'bomb',price:20},{item:'bait',price:60,oneTime:true}] },
    shopC: { greet:'A FAIR PRICE FOR A FAIR HERO.', wares:[
      {item:'bait',price:100,oneTime:true},{item:'key',price:80},{item:'heart',price:10}] },
    frontierShop: { greet:'WELCOME TO THE FRONTIER SHOP!', wares:[
      {item:'magicshield',price:90,oneTime:true},{item:'bomb',price:20},{item:'candle',price:60,oneTime:true}] },
    letter: { item:'letter', message:'TAKE THIS LETTER TO THE MEDICINE WOMAN.' },
    medicine: { gate:link => link.hasLetter, gateText:'SHOW ME THE LETTER', greet:'THE LETTER IS TRUE. CHOOSE A POTION.', wares:[
      {item:'bluepotion',price:40},{item:'redpotion',price:68}] },
    fairy: { special:'fairy' },
    whitesword: {item:'whitesword',gate:link => link.maxHealth >= 10,gateText:'ONLY THE WORTHY MAY TAKE THIS SWORD.',message:'YOU GOT THE WHITE SWORD!'},
    magicsword: {item:'magicsword',gate:link => link.maxHealth >= 24,gateText:'ONLY THE WORTHY MAY TAKE THE MAGIC SWORD.',message:'YOU GOT THE MAGIC SWORD!'},
    firerod: {item:'firerod',message:'GOT THE FIRE ROD!'},
    raft: {item:'raft',message:'TAKE THE RAFT. CROSS THE WATERS TO LEVEL 6!'},
    heartpiece: {item:'heartcontainer',message:'A HEART CONTAINER! YOUR LIFE GROWS.',repeat:'THE ALTAR IS EMPTY NOW.'},
    gift30: {item:'rupee30',oneTime:true,message:"IT'S A SECRET TO EVERYBODY."},
    gift100: {item:'rupee100',oneTime:true,message:"IT'S A SECRET TO EVERYBODY."},
    repair: {special:'repair'},
    bombupgrade: {wares:[{item:'bombupgrade',price:100,oneTime:true}],greet:'UPGRADE YOUR BOMB BAG.'},
    bombpack: {item:'bombupgrade',message:'A SECRET BOMB PACK! YOUR BAG GROWS.'},
    gamble: {special:'gamble',greet:"LET'S PLAY MONEY MAKING GAME"},
    hintL7: {dialog:['LEVEL-7 SLEEPS EAST BEYOND THE PEAKS. WAKE IT WITH A TUNE.']},
    hintL8: {dialog:['LEVEL-8 HIDES DEEP IN THE SOUTHERN WOODS.']},
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
    vault100: {item:'rupee100',oneTime:true,message:'A HIDDEN VAULT! TAKE THE RUPEES.'},
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
    const exitPos = tile ? freeBelow(tile.c, tile.r + 1) : [state.link.x, PLAY_H - 28];
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
    state.mode = 'cave'; state.link.x = 7 * 16; state.link.y = PLAY_H - 20;
    if (def.special === 'fairy') {
      state.link.health = state.link.maxHealth;
      state.entities.push(E.makeItem('fairy', 7 * 16, 4 * 16, {permanent:true}));
      showMsg('A FAIRY RESTORES YOUR LIFE.', 180); Sound.SFX.heart();
    } else if (def.special === 'lakeSecret') {
      state.cave.lakeSecret = true;
      if (!state.taken.has(caveUnique('rupee100'))) spawnCaveItem('rupee100', 7, {unique:caveUnique('rupee100')});
      if (!state.taken.has(caveUnique('fairy'))) spawnCaveItem('fairy', 11, {unique:caveUnique('fairy')});
      showMsg('THE POND DRAINS. A FAIRY WAITS BELOW.', 220);
    } else if (def.special === 'shortcutWest' || def.special === 'shortcutEast') {
      state.cave.shortcutTo = def.special === 'shortcutWest' ? {col:11,row:7,x:5*16,y:7*16} : {col:0,row:7,x:5*16,y:7*16};
      showMsg('THE OLD ROAD RUNS BENEATH HYRULE.', 180);
    } else if (def.special === 'repair') {
      const key = caveUnique('doorrepair');
      if (!state.taken.has(key)) {
        state.link.rupees = Math.max(0, state.link.rupees - 20);
        state.taken.add(key); saveGame(); showMsg('PAY FOR MY DOOR REPAIR', 180);
      } else showMsg('THE DOOR IS FIXED.', 160);
    } else if (def.special === 'gamble') {
      state.cave.gamble = true;
      if (state.taken.has(caveUnique('gamble'))) showMsg('NO MORE GAMES TODAY.', 160);
      else {
        showMsg(def.greet, 99999);
        for (let i = 0; i < 3; i++) spawnCaveItem('gamble', [4,7,10][i], {gambleIndex:i});
      }
    } else if (def.gate && !def.gate(state.link)) {
      showDialog({pages:[def.gateText || 'COME BACK LATER.']});
    } else if (def.wares) {
      if (def.greet) showMsg(def.greet, 99999);
      spawnShop(def);
    } else if (def.item) {
      const unique = caveUnique(def.item);
      const owned = (def.item === 'sword' && state.link.hasSword) || (def.item === 'candle' && state.link.hasCandle) ||
        (def.item === 'ring' && state.link.hasRing) || (def.item === 'raft' && state.link.hasRaft) ||
        (def.item === 'redring' && state.link.hasRedRing) ||
        (def.item === 'firerod' && state.link.hasFireRod);
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
      state.link.dir = 'down'; Sound.resumeMusic(); saveGame(); return;
    }
    loadOverworld(ret.col, ret.row, ret.pos);
    state.link.dir = 'down'; Sound.resumeMusic();
    saveGame();
  }

  function caveKindAt(sc, tile) {
    for (const cave of sc.caves || []) if (cave.c === tile.c && cave.r === tile.r) return cave.kind;
    if (sc.cave && sc.cave.kind) return sc.cave.kind;
    const secret = sc.secret, pos = secret && secret.tile;
    return pos && pos.c === tile.c && pos.r === tile.r ? secret.kind : null;
  }

  function enterDungeon(level, tile) {
    if (level === 9 && !['level9Open','ganonDefeated','rescued'].includes(state.quest.phase)) return;
    if (level === 6 && !state.link.hasRaft) {
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
    state.banner = 'LEVEL-' + level + '  ' + (DUNGEON_NAMES[level] || 'DUNGEON'); state.bannerT = 120;
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
    // place Link on the open tile just below the dungeon entrance
    const pos = ret.tile ? freeBelow(ret.tile.c, ret.tile.r + 1) : [7 * 16, 8 * 16];
    state.link.x = pos[0]; state.link.y = pos[1]; state.link.dir = 'down';
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

  // ---------- save / continue (localStorage) ----------
  const SAVE_KEY = 'zelda_save_v1';
  const LINK_SAVE_KEYS = [
    'maxHealth','health','bombs','maxBombs','rupees','keys','swordDmg','bItem','triforce','potion','potionCharges',
    ...Object.values(ITEMS).map(it => it.flag).filter(Boolean),
    ...Object.values(ITEMS).flatMap(it => it.saveFields || []),
  ];
  const UNIQUE_LINK_SAVE_KEYS = [...new Set(LINK_SAVE_KEYS)];
  function saveGame() {
    try {
      const l = state.link;
      // anchor: current overworld screen, or the overworld return point if inside
      let col = state.col, row = state.row, x = l.x, y = l.y;
      if (state.level && state.prevReturn) {
        col = state.prevReturn.col; row = state.prevReturn.row;
        x = 7 * 16; y = 8 * 16;
      } else if (state.cave && state.cave.ret) {
        col = state.cave.ret.col; row = state.cave.ret.row;
        x = state.cave.ret.pos[0]; y = state.cave.ret.pos[1];
      }
      const link = {};
      for (const k of UNIQUE_LINK_SAVE_KEYS) link[k] = l[k];
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        v: 2,
        quest: { phase: state.quest.phase, triforces: state.triforces },
        link,
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
      }));
    } catch (e) { /* storage unavailable (private mode etc.) — play on */ }
  }
  function hasSave() {
    try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
  }
  function isRecord(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function finite(v) { return typeof v === 'number' && Number.isFinite(v); }
  function int(v) { return finite(v) && Number.isInteger(v); }
  function stringArray(v, optional = true) {
    if (v === undefined && optional) return [];
    return Array.isArray(v) && v.every(s => typeof s === 'string');
  }
  function numberOrDefault(v, fallback) { return finite(v) ? v : fallback; }
  function clampLink(l) {
    l.maxHealth = Math.max(6, Math.min(80, Math.round(numberOrDefault(l.maxHealth, 6))));
    l.health = Math.max(0, Math.min(l.maxHealth, Math.round(numberOrDefault(l.health, l.maxHealth))));
    l.maxBombs = Math.max(8, Math.min(16, Math.round(numberOrDefault(l.maxBombs, 8))));
    l.bombs = Math.max(0, Math.min(l.maxBombs, Math.round(numberOrDefault(l.bombs, 0))));
    l.rupees = Math.max(0, Math.min(ITEMS.caps.rupees, Math.round(numberOrDefault(l.rupees, 0))));
    l.keys = Math.max(0, Math.min(ITEMS.caps.keys, Math.round(numberOrDefault(l.keys, 0))));
    l.swordDmg = Math.max(1, Math.min(9, Math.round(numberOrDefault(l.swordDmg, 1))));
    l.health = Math.max(6, l.health);   // continue with ≥3 hearts, as in v1
  }
  function validateLinkSave(saved) {
    if (saved !== undefined && !isRecord(saved)) return false;
    if (!saved) return true;
    for (const k of UNIQUE_LINK_SAVE_KEYS) {
      if (!(k in saved)) continue;
      const value = saved[k];
      if (['maxHealth','health','bombs','maxBombs','potionCharges','rupees','keys','swordDmg'].includes(k)) {
        if (!finite(value)) return false;
      } else if (k === 'potion') {
        if (value !== null && typeof value !== 'string') return false;
      } else if (k === 'bItem') {
        if (typeof value !== 'string') return false;
      } else if (typeof value !== 'boolean') return false;
    }
    return true;
  }
  function validPosition(pos) {
    return isRecord(pos) && int(pos.col) && int(pos.row) && finite(pos.x) && finite(pos.y) &&
      pos.x >= 0 && pos.x <= PLAY_W && pos.y >= 0 && pos.y <= PLAY_H &&
      !!World.get(pos.col, pos.row);
  }
  function normalizeSecretIds(values) {
    return values.map(s => (s.startsWith('sec:') || s.startsWith('reveal:')) ? s : 'sec:' + s);
  }
  function migrateV1Unlocked(values) {
    if (typeof Dungeon !== 'undefined' && Dungeon.edgeForDoorTile) {
      return values.map(s => Dungeon.edgeForDoorTile(s)).filter(Boolean);
    }
    return values.slice();
  }
  function readSave() {
    let data;
    try { data = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { return null; }
    if (!isRecord(data) || !int(data.v)) return null;
    if (data.v === 1) {
      if (!int(data.col) || !int(data.row) || !World.get(data.col, data.row) ||
          !validateLinkSave(data.link) || !stringArray(data.taken) ||
          !stringArray(data.revealed) || !stringArray(data.unlocked)) return null;
      if (data.x !== undefined && (!finite(data.x) || data.x < 0 || data.x > PLAY_W)) return null;
      if (data.y !== undefined && (!finite(data.y) || data.y < 0 || data.y > PLAY_H)) return null;
      return {
        version: 1,
        link: data.link || {},
        position: { col: data.col, row: data.row, x: numberOrDefault(data.x, 7 * 16), y: numberOrDefault(data.y, 8 * 16) },
        taken: data.taken || [],
        revealed: normalizeSecretIds(data.revealed || []),
        edges: migrateV1Unlocked(data.unlocked || []),
        triforces: Math.max(0, Math.min(TRIFORCE_PIECES, Math.round(numberOrDefault(data.triforces, 0)))),
        visitedScreens: [], visitedRooms: [], stock: {}, counters: {},
      };
    }
    const position = data.world && data.world.position ? data.world.position :
      (data.position || { col: World.findStart().col, row: World.findStart().row, x: 7 * 16, y: 8 * 16 });
    if (data.v !== 2 || !isRecord(data.quest) ||
        !['collecting','level9Open','ganonDefeated','rescued'].includes(data.quest.phase) ||
        !finite(data.quest.triforces) || !isRecord(data.world) || !isRecord(data.link) ||
        !validateLinkSave(data.link) || !validPosition(position) ||
        !stringArray(data.world.taken, false) || !stringArray(data.world.revealed, false) ||
        !stringArray(data.world.visitedScreens, false) || !stringArray(data.world.visitedRooms, false) ||
        !isRecord(data.world.edges) || !isRecord(data.world.stock) || !isRecord(data.world.counters)) return null;
    for (const k in data.world.edges) if (!['open','locked','shut','shutter'].includes(data.world.edges[k])) return null;
    return {
      version: 2,
      phase: data.quest.phase,
      link: data.link,
      position,
      taken: data.world.taken,
      revealed: normalizeSecretIds(data.world.revealed),
      edges: Object.keys(data.world.edges).filter(k => data.world.edges[k] === 'open'),
      visitedScreens: data.world.visitedScreens,
      visitedRooms: data.world.visitedRooms,
      stock: data.world.stock,
      counters: data.world.counters,
      triforces: Math.max(0, Math.min(TRIFORCE_PIECES, Math.round(data.quest.triforces))),
    };
  }
  function loadGame() {
    const save = readSave();
    if (!save) { startGame(); return false; }
    startGame();   // fresh baseline, then overlay the save
    const l = state.link;
    for (const k of UNIQUE_LINK_SAVE_KEYS) if (k in save.link) l[k] = save.link[k];
    clampLink(l);
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
    state.triforces = save.triforces;
    state.quest = { phase: save.phase || 'collecting', triforces: state.triforces };
    const p = save.position;
    loadOverworld(p.col, p.row, [p.x, p.y]);
    return true;
  }

  // ---------- callbacks from entities ----------
  state.solidAt = solidAt;
  state.solidFor = solidFor;
  state.spawn = (e) => state.entities.push(e);
  state.rupeePopup = (text, x, y) => state.rupeePopups.push({ text, x:x === undefined ? state.link.x : x, y:y === undefined ? state.link.y : y, t:42 });
  state.showMsg = (text, frames) => showMsg(text, frames);
  state.saveGame = () => saveGame();
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
        (!sc.dungeon || sc.dungeon.level !== 9 || ['level9Open','ganonDefeated','rescued'].includes(state.quest.phase))) {
      state.revealed.add(id); state.grid[5][7] = 'D'; state.screenImg = bakeScreen(state.grid, state.theme);
      showMsg('A HIDDEN ENTRANCE AWAKENS!', 180); saveGame(); return true;
    }
    return false;
  };
  function revealL9Entrance() {
    if (state.mode !== 'overworld' || state.col !== 11 || state.row !== 0 ||
        !['level9Open','ganonDefeated','rescued'].includes(state.quest.phase) || state.revealed.has('sec:11,0')) return false;
    state.revealed.add('sec:11,0');
    if (state.grid[5] && state.grid[5][7] !== 'D') state.grid[5][7] = 'D';
    state.screenImg = bakeScreen(state.grid, state.theme);
    Sound.SFX.secret(); Sound.SFX.stairs(); showMsg('THE MOUNTAIN OPENS!', 180); saveGame();
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
    state.link.x = pos[0]; state.link.y = pos[1]; state.link.dir = 'up'; state.counters.whistleCursor = next; saveGame(); return true;
  };
  state.onHungryGoriya = (e) => {
    if (state.level && state.link.hasBait) {
      state.link.hasBait = false; state.taken.add('fedgoriya:L' + state.level.id); e.alive = false;
      if (state.grid[5] && state.grid[5][7] === 'B') state.grid[5][7] = 'F';
      const room = Dungeon.getRoom(state.level, state.col, state.row);
      state.cleared.add(key3('d' + state.level.id, state.col, state.row));
      state.screenImg = bakeScreen(state.grid, state.theme); Sound.SFX.secret();
      if (room) spawnRoomItem(room, state.level.id, state.col, state.row);
      saveGame();
    } else showDialog({pages:['GRUMBLE, GRUMBLE...']});
  };
  state.onWallmasterGrab = (e) => {
    if (state.mode !== 'dungeon' || e.grabbed) return;
    e.grabbed = true;
    state.showMsg('THE WALLMASTER GRABS LINK!', 100);
    const entry = state.level.entry;
    loadDungeonRoom(entry.col, entry.row, [entry.pos[0] * 16, entry.pos[1] * 16]);
  };
  state.onLinkDead = () => {
    clearHoist(); state.lowHealthT = 0;
    state.mode = 'gameover'; state.msgT = 180; Sound.SFX.die(); Sound.stopMusic();
  };

  function resolveItemTouch(gameState, it) {
    if (it.item === 'gamble') {
      if (gameState.link.rupees < 10) {
        if (!it._refusedTouch) { it._refusedTouch = true; showMsg("BUY SOMETHIN' WILL YA!", 150); }
        return 'refused';
      }
      const n = gameState.counters.gambleN || 0;
      gameState.counters.gambleN = n + 1;
      const outcomes = [-10, 20, 50];
      const amount = outcomes[(n + (it._gambleIndex || 0)) % 3];
      gameState.link.rupees = Math.max(0, Math.min(ITEMS.caps.rupees, gameState.link.rupees + amount));
      gameState.taken.add(caveUnique('gamble'));
      for (const e of gameState.entities) if (e._gambleIndex !== undefined) e.alive = false;
      showMsg(amount < 0 ? 'YOU LOST 10 RUPEES.' : '+' + amount + ' RUPEES!', 180);
      saveGame();
      return 'taken';
    }
    if (it._unique && gameState.taken.has(it._unique)) { it.alive = false; return 'kept'; }
    const def = ITEMS[it.item];
    if (!def) return 'kept';
    if (it.oneTime && it._stockKey && gameState.stock[it._stockKey]) return 'kept';
    if (it.price && gameState.link.rupees < it.price) {
      if (!it._refusedTouch) { it._refusedTouch = true; showMsg("BUY SOMETHIN' WILL YA!", 150); }
      return 'refused';
    }
    it._refusedTouch = false;
    const result = def.onCollect ? def.onCollect(gameState.link, gameState, it) : undefined;
    if (result === 'refused') return 'refused';
    if (result === 'kept') return 'kept';
    if (it.price) { gameState.link.rupees -= it.price; Sound.SFX.rupee(); }
    if (it.oneTime && it._stockKey) gameState.stock[it._stockKey] = true;
    if (it._unique) { gameState.taken.add(it._unique); saveGame(); }
    else if (it.price || it.oneTime) saveGame();
    const major = (def.slot === 'gear' || (def.slot === 'b' && it.item !== 'bomb') ||
      it.item === 'heartcontainer' || it.item === 'triforce');
    if (major && gameState.link.health > 0) {
      gameState.link.hoist = 32;
      gameState.link.hoistItem = it.item;
    }
    return 'taken';
  }
  function collect(it) { return resolveItemTouch(state, it); }

  function onEnemyKilled(e) {
    state.entities.push(E.makeFx('poof', e.x, e.y));   // death poof
    if (e.boss || e.noDrops) return;
    const group = e.dropClass || ({
      octorok:'minor', keese:'minor', gel:'minor', rope:'minor', leever:'minor', tektite:'minor',
      moblin:'mid', goriya:'mid', stalfos:'mid', zola:'mid', zol:'mid',
      lynel:'elite', darknut:'elite', ironknuckle:'elite', wizzrobe:'elite',
    })[e.etype];
    if (!group) return;
    const kills = (state.counters.kills || 0) + 1;
    state.counters.kills = kills;
    const forceBomb = kills % 16 === 0 && state.link.bombs <= 0;
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
    if (e.etype === 'ganon') {
      state.quest.phase = 'ganonDefeated';
      state.cleared.add(key3('d' + lvl.id, state.col, state.row));
      openCondition('ganon');
      saveGame();
      showMsg('GANON IS DESTROYED. RESCUE ZELDA.', 240);
      return;
    }
    // drop heart container, then triforce appears
    const heart = E.makeItem('heartcontainer', 4 * 16, 5 * 16, { permanent: true });
    heart._unique = 'bossheart:L' + lvl.id;
    state.entities.push(heart);
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
    const sword = swordRect(), lx = state.link.x + 8, ly = state.link.y + 8;
    for (const en of state.entities) {
      if (en.kind !== 'enemy' || en.alive === false ||
          ((en.hidden || en.invulnerable) && en.etype !== 'ganon')) continue;
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
        en.hurt(state, state.link.swordDmg || 1, hit.x, hit.y);
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

    if (state.link && state.link.health > 0 && state.link.health <= 2 &&
        (state.mode === 'overworld' || state.mode === 'dungeon' || state.mode === 'cave')) {
      state.lowHealthT++;
      if (state.lowHealthT >= 45) { state.lowHealthT = 0; Sound.SFX.lowbeat(); }
    } else state.lowHealthT = 0;

    if (state.mode === 'title') {
      if (P.start || P.a) { Sound.ensure(); startGame(); }
      else if (P.cont && hasSave()) { Sound.ensure(); loadGame(); }
      return;
    }
    if (state.mode === 'gameover') {
      if (P.start || P.a) { if (!hasSave() || !loadGame()) startGame(); }   // continue from last save
      if (state.msgT > 0) state.msgT--;
      return;
    }
    if (state.mode === 'ending') {
      state.flashEnding++;
      if ((P.start || P.a) && state.flashEnding > 120) { state.mode = 'title'; state.flashEnding = 0; }
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
    if (state.mode === 'pause') {
      updatePause();
      return;
    }

    // playing modes: overworld / dungeon / cave
    if (P.start) {   // pause / inventory
      state.prevMode = state.mode;
      state.mode = 'pause';
      state.pauseIcons = buildPauseIcons();
      state.pauseSel = Math.max(0, state.pauseIcons.bIds.indexOf(state.link.bItem));
      Sound.SFX.select();
      return;
    }
    // B-item quick cycle
    if (P.select) cycleItem();

    if (tryStartRaftRide()) return;
    state.link.update(state);
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

    // deferred dungeon exit after collecting a non-final Triforce piece
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
      const t = tileAtPx(state.link.x + 8, state.link.y + 10);
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
    const l = state.link;
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
    const l = state.link;
    return Object.keys(ITEMS).filter(id => ITEMS[id].slot === 'b' &&
      (!ITEMS[id].flag || l[ITEMS[id].flag]));
  }
  function updatePause() {
    const P = Engine.pressed;
    if (P.start) { state.mode = state.prevMode; Sound.SFX.select(); return; }
    const owned = state.pauseIcons.bIds;
    if (P.left)  { state.pauseSel = (state.pauseSel + owned.length - 1) % owned.length; Sound.SFX.select(); }
    if (P.right) { state.pauseSel = (state.pauseSel + 1) % owned.length; Sound.SFX.select(); }
    if (P.a || P.select) {
      state.link.bItem = owned[state.pauseSel];
      Sound.SFX.item();
    }
  }

  function cycleItem() {
    const l = state.link;
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
    const bIds = ownedBItems(), gearIds = [], l = state.link;
    if (l.hasSword) gearIds.push(l.hasMagicSword ? 'magicsword' : l.hasWhiteSword ? 'whitesword' : 'sword');
    for (const id of ['shield','magicshield','bait','ring','redring','stepladder','raft','powerbracelet','magickey','silverarrows']) {
      const def = ITEMS[id];
      if (def.slot === 'gear' && def.flag && l[def.flag] && !gearIds.includes(id)) gearIds.push(id);
    }
    return { bIds, b: bIds.map(makePauseIcon), gear: gearIds.map(makePauseIcon) };
  }

  function startGame() {
    // reset link + world
    const st = World.findStart();
    state.link = E.makeLink(st.screen.startPos[0] * 16, st.screen.startPos[1] * 16);
    state.cleared = new Set(); state.taken = new Set(); state.worldEdges = {}; state.edgeState = {};
    state.revealed = new Set(); state.pushed = new Set(); state.lit = new Set();
    state.dark = false;
    state.level = null; state.cave = null; state.scroll = null;
    state.msg = null; state.msgT = 0; state.dialogue = null; state.triforces = 0;
    state._raftGateTile = null;
    state._raftRide = null;
    state.raftRide = null;
    state.pauseIcons = null;
    state.quest = { phase: 'collecting', triforces: 0 };
    state.visitedScreens = new Set(); state.visitedRooms = new Set();
    state.stock = {}; state.counters = {}; state.rupeePopups = [];
    state.lowHealthT = 0;
    loadOverworld(st.col, st.row, [st.screen.startPos[0] * 16, st.screen.startPos[1] * 16]);
    state.mode = 'overworld';
    Sound.playTrack('overworld');
  }

  // ---------- rendering ----------
  function render(ctx) {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);

    if (state.mode === 'title') { Sound.playTrack('title'); drawTitle(ctx); return; }
    if (state.mode === 'win') { drawWin(ctx); return; }
    if (state.mode === 'ending') { Sound.playTrack('ending'); drawEnding(ctx); return; }

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
      for (const e of state.entities) if ((e.kind === 'enemy' || e.kind === 'hazard') && !(e._spawnDelay > 0)) e.draw(ctx, 0, 0);
      for (const e of state.entities) if (e.kind === 'proj') e.draw(ctx, 0, 0);
      for (const e of state.entities) if (e.kind === 'fx') e.draw(ctx, 0, 0);
      if (state.mode === 'cave') drawCaveShop(ctx);
      drawSword(ctx);
      state.link.draw(ctx, 0, 0);
      for (const p of state.rupeePopups) Engine.text(ctx, p.text, p.x | 0, p.y | 0, '#f8d030');
      if (state.mode === 'cave') drawOldMan(ctx);
      if (state.dark && (state.mode === 'dungeon' || state.mode === 'pause')) drawDarkness(ctx);
    }
    ctx.restore();

    if (state.mode === 'pause') drawPause(ctx);
    if (state.mode === 'gameover') drawGameOver(ctx);
    if (state.msg && state.msgT > 0) drawMessage(ctx);
    if (state.bannerT > 0 && state.banner) {
      ctx.fillStyle = 'rgba(0,0,0,0.82)'; ctx.fillRect(48, HUD_H + 8, PLAY_W - 96, 24);
      Engine.text(ctx, state.banner, 68, HUD_H + 16, '#f8d030');
    }
    drawMuteIcon(ctx, 4, 52);
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
    const l = state.link;
    const r = swordRect();
    ctx.fillStyle = '#f8f8f8';
    if (l.dir === 'right' || l.dir === 'left') ctx.fillRect(r.x, r.y + 2, r.w, 3);
    else ctx.fillRect(r.x + 2, r.y, 3, r.h);
    ctx.fillStyle = '#c0c0c0';
    if (l.dir === 'right' || l.dir === 'left') ctx.fillRect(r.x, r.y + 3, r.w, 1);
    else ctx.fillRect(r.x + 3, r.y, 1, r.h);
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
  function drawCaveShop(ctx) {
    if (!state.cave || !state.cave.shop) return;
    for (const it of state.entities) {
      if (it.price === undefined || it.alive === false) continue;
      Engine.text(ctx, String(it.price), (it.x | 0) + 2, (it.y | 0) + 19, '#f8d030');
    }
  }

  // Dark room: black everywhere except a lit square around Link (bigger if he
  // carries the candle). Retro hard-edged light, no alpha gradients.
  function drawDarkness(ctx) {
    const l = state.link;
    const r = l.hasCandle || l.hasFireRod ? 40 : 24;
    const hx = Math.max(0, l.x + 8 - r), hy = Math.max(0, l.y + 8 - r);
    const hw = Math.min(PLAY_W, l.x + 8 + r) - hx, hh = Math.min(PLAY_H, l.y + 8 + r) - hy;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, PLAY_W, hy);                                  // top
    ctx.fillRect(0, hy + hh, PLAY_W, PLAY_H - hy - hh);              // bottom
    ctx.fillRect(0, hy, hx, hh);                                     // left
    ctx.fillRect(hx + hw, hy, PLAY_W - hx - hw, hh);                 // right
  }

  // ---------- pause / inventory screen ----------
  function drawPause(ctx) {
    const l = state.link;
    const icons = state.pauseIcons || (state.pauseIcons = buildPauseIcons());
    ctx.fillStyle = 'rgba(0,0,0,0.88)';
    ctx.fillRect(8, HUD_H + 6, PLAY_W - 16, PLAY_H - 12);
    ctx.strokeStyle = '#f8d030'; ctx.strokeRect(8.5, HUD_H + 6.5, PLAY_W - 17, PLAY_H - 13);
    Engine.text(ctx, 'INVENTORY', 96, HUD_H + 14, '#f8d030');

    // B-item selector row
    Engine.text(ctx, 'USE B', 20, HUD_H + 32, '#888');
    const bx = 20, by = HUD_H + 44;
    icons.b.forEach((icon, i) => {
      const it = icon.id;
      const x = bx + i * 30;
      ctx.fillStyle = '#181818'; ctx.fillRect(x, by, 24, 24);
      if (i === state.pauseSel && ((state.msgT | 0) || true)) {
        ctx.strokeStyle = '#fff'; ctx.strokeRect(x + 0.5, by + 0.5, 23, 23);
      }
      if (it === l.bItem) { ctx.strokeStyle = '#f8d030'; ctx.strokeRect(x + 2.5, by + 2.5, 19, 19); }
      icon.draw(ctx, x + 5, by + 6);
    });

    // passive gear row
    Engine.text(ctx, 'GEAR', 20, HUD_H + 78, '#888');
    icons.gear.forEach((icon, i) => {
      const x = 20 + i * 24, y = HUD_H + 90;
      icon.draw(ctx, x, y);
    });

    // triforce tally
    Engine.text(ctx, 'TRIFORCE ' + state.triforces + '/' + TRIFORCE_PIECES, 20, HUD_H + 118, '#f8d030');
    Engine.text(ctx, 'START RESUME  <> PICK  A SET', 20, HUD_H + 140, '#666');
  }
  // drawItem lives in entities.js's closure — tiny shim for gear icons
  function drawItem(fake, ctx, ox, oy) {
    const it = E.makeItem(fake.item, fake.x, fake.y, { permanent: true });
    it.t = 0;
    it.draw(ctx, ox, oy);
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
      for (let i = 0; i < TRIFORCE_PIECES; i++) {
        const tx = 8 + i * 12, got = i < state.triforces;
        ctx.fillStyle = got ? '#f8d030' : '#3a3000';
        ctx.fillRect(tx + 4, 44, 1, 1); ctx.fillRect(tx + 3, 45, 3, 1);
        ctx.fillRect(tx + 2, 46, 5, 1); ctx.fillRect(tx + 1, 47, 7, 1); ctx.fillRect(tx, 48, 9, 1);
      }
    }

    // item boxes (center)
    const bx = 120;
    const disabledFlash = l.swordDisabled > 0 && ((l.swordDisabled >> 2) & 1);
    ctx.fillStyle = disabledFlash ? '#7a2020' : '#444'; ctx.fillRect(bx, 18, 40, 32);
    Engine.text(ctx, 'B', bx + 2, 8, disabledFlash ? '#f8d030' : '#fff');
    Engine.text(ctx, 'A', bx + 26, 8, disabledFlash ? '#f8d030' : '#fff');
    ctx.fillStyle = '#000'; ctx.fillRect(bx + 2, 20, 16, 28); ctx.fillRect(bx + 22, 20, 16, 28);
    drawBIcon(ctx, l.bItem, bx + 3, 26, l);
    if (l.hasSword) drawSwordItem({ x: bx + 27, y: 24 }, ctx, 0, 0);
    // ring indicator (passive) just left of the item boxes
    if (l.hasRing || l.hasRedRing) {
      ctx.fillStyle = l.hasRedRing ? '#d82828' : '#3858f8'; ctx.beginPath(); ctx.arc(110, 32, 5, 0, 7); ctx.fill();
      ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(110, 32, 2, 0, 7); ctx.fill();
    }

    // counts
    Engine.text(ctx, 'X' + pad3(l.rupees), 170, 12, '#fff');   // rupees
    // rupee icon
    ctx.fillStyle = '#34b233'; ctx.fillRect(170, 22, 8, 12);
    Engine.text(ctx, 'X' + pad2(l.keys), 170, 36, '#fff');     // keys
    ctx.fillStyle = '#f8d030'; ctx.fillRect(196, 36, 6, 10);
    Engine.text(ctx, 'X' + pad2(l.bombs), 170, 50, '#fff');    // bombs
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
  function drawBIcon(ctx, item, x, y, link) {
    const def = ITEMS[item];
    if (item === 'potion') {
      itemIconPotion(ctx, x, y, link && link.potion === 'red' ? '#d82828' : '#3858f8');
      if (link && link.potionCharges) {
        ctx.fillStyle = '#fff';
        for (let i = 0; i < link.potionCharges; i++) ctx.fillRect(x + 1 + i * 4, y + 14, 3, 2);
      }
    } else if (def && def.icon) def.icon(ctx, x, y);
  }
  function drawMuteIcon(ctx, x, y) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(x, y + 4, 3, 5); ctx.fillRect(x + 3, y + 2, 3, 9);
    ctx.fillRect(x + 6, y + 2, 3, 9); ctx.fillRect(x + 9, y, 2, 13);
    if (Sound.isMuted()) {
      ctx.fillStyle = '#d82828'; ctx.fillRect(x - 1, y, 2, 13); ctx.fillRect(x + 1, y + 2, 2, 9);
    } else {
      ctx.fillStyle = '#fff'; ctx.fillRect(x + 11, y + 4, 2, 5);
    }
  }
  function drawHeart(ctx, x, y, kind) {
    const draw = (col) => { ctx.fillStyle = col; ctx.fillRect(x + 1, y, 2, 2); ctx.fillRect(x + 5, y, 2, 2); ctx.fillRect(x, y + 1, 8, 3); ctx.fillRect(x + 1, y + 4, 6, 1); ctx.fillRect(x + 2, y + 5, 4, 1); ctx.fillRect(x + 3, y + 6, 2, 1); };
    if (kind === 'full') draw('#d82828');
    else if (kind === 'empty') draw('#202020');
    else { ctx.fillStyle = '#202020'; ctx.fillRect(x, y, 8, 7); ctx.save(); ctx.beginPath(); ctx.rect(x, y, 4, 8); ctx.clip(); draw('#d82828'); ctx.restore(); }
  }
  function pad3(n) { n = Math.max(0, Math.min(999, n | 0)); return (n < 10 ? '00' : n < 100 ? '0' : '') + n; }
  function pad2(n) { n = Math.max(0, Math.min(99, n | 0)); return n < 10 ? '0' + n : '' + n; }

  function drawMiniMap(ctx, x, y) {
    if ((state.mode === 'dungeon' || (state.mode === 'pause' && state.level)) && state.level) {
      const b = Dungeon.bounds(state.level);
      const hasMap = state.taken.has('map:L' + state.level.id);
      const hasCompass = state.taken.has('compass:L' + state.level.id);
      const triRoom = Object.keys(state.level.rooms).find(k => state.level.rooms[k].triforce) ||
        (state.level.id === 9 && Object.keys(state.level.rooms).find(k => state.level.rooms[k].boss));
      for (const k in state.level.rooms) {
        const [c, r] = k.split(',').map(Number);
        if (!hasMap && !state.visitedRooms.has(state.level.id + ':' + k)) continue;
        const cur = (c === state.col && r === state.row);
        const target = hasCompass && k === triRoom;
        ctx.fillStyle = target ? (((Date2() >> 0) & 1) ? '#fff' : '#d82828')
          : cur ? (((Date2() >> 0) & 1) ? '#f8d030' : '#888') : '#0048b0';
        ctx.fillRect(x + (c - b.minC) * 9, y + (r - b.minR) * 8, 7, 6);
      }
    } else {
      // Overworld map: only visited screens are lit. Dungeon entrances get a
      // small marker after that dungeon has actually been visited.
      const C = World.COLS_W, R = World.ROWS_W, step = 2, sz = 2;
      for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
        if (!World.has(c, r)) continue;
        const cur = (c === state.col && r === state.row);
        const visited = state.visitedScreens.has(c + ',' + r);
        const dungeonLevel = DUNGEON_SCREEN_LEVELS[c + ',' + r];
        const dungeonVisited = dungeonLevel && state.visitedScreens.has('dungeon:L' + dungeonLevel);
        ctx.fillStyle = cur ? '#f8d030' : dungeonVisited ? '#d82828' : visited ? '#1c5018' : '#080c08';
        ctx.fillRect(x + c * step, y + r * step, sz, sz);
      }
    }
  }
  // tiny blink counter without Date.now()
  let _blink = 0; function Date2() { _blink = (_blink + 1) & 31; return _blink >> 4; }

  // ---------- overlays ----------
  function drawMessage(ctx) {
    const baseLines = wrap(state.msg, 28);
    let lines = baseLines;
    if (state.dialogue) {
      lines = baseLines.slice();
      const page = state.dialogue.pages[state.dialogue.index];
      if (page && page.choices) page.choices.forEach((choice, i) => lines.push((i === state.dialogue.choice ? '> ' : '  ') + choice.label));
    }
    const h = lines.length * 12 + 12;
    const y = HUD_H + PLAY_H - h - 8;
    ctx.fillStyle = 'rgba(0,0,0,0.85)'; ctx.fillRect(16, y, PLAY_W - 32, h);
    ctx.strokeStyle = '#fff'; ctx.strokeRect(16.5, y + 0.5, PLAY_W - 33, h - 1);
    lines.forEach((ln, i) => Engine.text(ctx, ln, 24, y + 8 + i * 12, '#fff'));
  }
  const wrapCache = Object.create(null);
  function wrap(str, n) {
    const key = n + ':' + String(str);
    if (wrapCache[key]) return wrapCache[key];
    const words = String(str).split(' '); const out = []; let cur = '';
    for (const w of words) { if ((cur + ' ' + w).trim().length > n) { out.push(cur.trim()); cur = w; } else cur += ' ' + w; }
    if (cur.trim()) out.push(cur.trim());
    wrapCache[key] = out;
    return out;
  }

  function drawTitle(ctx) {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    // triforce
    const cx = 128, ty = 36;
    drawBigTriforce(ctx, cx, ty);
    Engine.text(ctx, 'THE LEGEND OF', cx - 52, 96, '#fff', 1);
    Engine.text(ctx, 'Z E L D A', cx - 56, 112, '#f8d030', 2);
    ctx.strokeStyle = '#f8d030'; ctx.strokeRect(28.5, 108.5, 200, 22);
    if (((Date2()) & 1)) Engine.text(ctx, 'PRESS  START', cx - 48, 160, '#fff');
    if (hasSave()) Engine.text(ctx, 'C - CONTINUE', cx - 48, 176, '#7dbc8a');
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
    Engine.text(ctx, 'ALL ' + TRIFORCE_PIECES + ' DUNGEONS CLEARED', 50, 150, '#fff');
    Engine.text(ctx, 'PEACE RETURNS TO HYRULE', 36, 168, '#888');
    if (state.flashWin > 120 && ((Date2()) & 1)) Engine.text(ctx, 'PRESS START', 84, 196, '#888');
  }
  function drawEnding(ctx) {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    drawBigTriforce(ctx, 128, 28);
    Engine.text(ctx, "THANKS LINK, YOU'RE THE", 42, 102, '#fff');
    Engine.text(ctx, 'HERO OF HYRULE.', 72, 118, '#f8d030');
    Engine.text(ctx, 'PEACE RETURNS TO HYRULE.', 42, 148, '#fff');
    Engine.text(ctx, 'ZELDA IS SAFE.', 82, 168, '#888');
    if (state.flashEnding > 120 && ((Date2()) & 1)) Engine.text(ctx, 'PRESS START', 84, 200, '#fff');
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

  return { init, state, solidFor, solidAt,
    // test hooks (harmless; enable headless integration testing)
    _test: { loadOverworld, loadDungeonRoom, enterDungeon, enterCave, exitCave, exitDungeon, startGame, collect, resolveItemTouch, saveGame, loadGame, hasSave, showDialog, update, render, drawHUD, drawMiniMap, startRaftRide, tryStartRaftRide, tryPush, CAVES, TRIFORCE_PIECES } };
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
