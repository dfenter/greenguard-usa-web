/* Headless smoke test: stub browser APIs, load the real game scripts in one
   shared lexical scope (like <script> tags), boot, and drive input for many
   frames through the main code paths. Fails loudly on any thrown error. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ---- stubs ----
function makeCtx() {
  const noop = () => {};
  return new Proxy({
    canvas: { width: 256, height: 240 },
    save: noop, restore: noop, translate: noop, scale: noop, clip: noop,
    beginPath: noop, rect: noop, arc: noop, fill: noop, stroke: noop,
    strokeRect: noop, fillRect: noop, drawImage: noop, fillText: noop,
    putImageData: noop, setTransform: noop, measureText: () => ({ width: 8 }),
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)) }),
    createLinearGradient: () => ({ addColorStop: noop }),
    fillStyle: '#000', strokeStyle: '#000', globalAlpha: 1, font: '', textBaseline: '',
    imageSmoothingEnabled: false, lineWidth: 1,
  }, { get(t, p) { return p in t ? t[p] : (() => {}); }, set(t, p, v) { t[p] = v; return true; } });
}
function makeCanvas() {
  return { width: 0, height: 0, style: {}, getContext: () => makeCtx(),
    addEventListener: () => {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 256, height: 240 }) };
}

let frameTime = 0;   // shared sim clock; also backs the performance.now() stub
const listeners = {};
const documentStub = {
  getElementById: () => makeCanvas(),
  createElement: (t) => t === 'canvas' ? makeCanvas() : { style: {} },
  addEventListener: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); },
};

let rafQueue = [];
const audioStub = function () {
  return {
    state: 'running', currentTime: 0, destination: {}, resume() {},
    createGain: () => ({ gain: { value: 1, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }),
    createOscillator: () => ({ type: '', frequency: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, start() {}, stop() {} }),
  };
};

const windowStub = {
  innerWidth: 1280, innerHeight: 800,
  addEventListener: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); },
  requestAnimationFrame: (fn) => { rafQueue.push(fn); return rafQueue.length; },
  AudioContext: audioStub, webkitAudioContext: audioStub,
  setTimeout: () => 0, clearTimeout: () => {},
};

const sandbox = {
  window: windowStub, document: documentStub,
  requestAnimationFrame: windowStub.requestAnimationFrame,
  setTimeout: () => 0, clearTimeout: () => {},
  AudioContext: audioStub, webkitAudioContext: audioStub,
  Image: function () { return {}; },
  ImageData: function (w, h) { return { width: w, height: h, data: new Uint8ClampedArray(Math.max(1, w * h * 4)) }; },
  Math, Date, JSON, console, Uint8ClampedArray, Array, Object, String, Number, Boolean,
  parseInt, parseFloat, isNaN, Set, Map,
  performance: { now: () => frameTime },
  localStorage: (() => {   // in-memory stub so the save feature is testable
    const store = {};
    return { getItem: k => (k in store ? store[k] : null),
             setItem: (k, v) => { store[k] = String(v); },
             removeItem: k => { delete store[k]; } };
  })(),
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

// ---- load scripts in order, one shared script (shared lexical scope) ----
const order = ['engine', 'sound', 'sprites', 'tiles', 'world', 'dungeon', 'entities', 'game'];
const base = path.join(__dirname, '..', 'js');
let combined = '';
for (const name of order) combined += fs.readFileSync(path.join(base, name + '.js'), 'utf8') + '\n;\n';
// expose lexical globals to the test harness (browser sees these as lexical globals too)
combined += '\n;globalThis.Game=Game;globalThis.Engine=Engine;globalThis.Entities=Entities;' +
            'globalThis.World=World;globalThis.Dungeon=Dungeon;globalThis.Sprites=Sprites;\n';

try {
  vm.runInContext(combined, sandbox, { filename: 'combined.js' });
} catch (e) { console.error('LOAD ERROR:', e.stack); process.exit(1); }

// fire window 'load' -> Game.init()
function dispatch(ev, arg) { (listeners[ev] || []).forEach(fn => fn(arg)); }
try { dispatch('load'); } catch (e) { console.error('INIT ERROR:', e.stack); process.exit(1); }

// ---- input helpers ----
function keydown(code) { dispatch('keydown', { code, preventDefault() {} }); }
function keyup(code) { dispatch('keyup', { code, preventDefault() {} }); }
function tap(code) { keydown(code); }

// advance N frames; each rAF callback re-queues itself
function frames(n) {
  for (let i = 0; i < n; i++) {
    const q = rafQueue; rafQueue = [];
    frameTime += 16.7;
    for (const fn of q) fn(frameTime);
  }
}

const G = sandbox.Game;
function assert(cond, msg) { if (!cond) { console.error('ASSERT FAIL:', msg); process.exit(1); } }

try {
  assert(G && G.state, 'Game.state exists');
  assert(G.state.mode === 'title', 'starts on title, got ' + G.state.mode);

  // press start
  keydown('Enter'); frames(2); keyup('Enter');
  assert(G.state.mode === 'overworld', 'entered overworld, got ' + G.state.mode);
  const startCol = G.state.col, startRow = G.state.row;

  // walk up into the sword cave (start screen cave at tile 7,2; link starts ~7,8)
  keydown('ArrowUp'); frames(140); keyup('ArrowUp');
  // should have entered cave and gotten near the sword; walk to it
  frames(30);
  // collect sword by moving to it (it's at center-top); nudge around
  keydown('ArrowUp'); frames(40); keyup('ArrowUp');
  assert(G.state.link.hasSword || G.state.mode === 'cave', 'in cave or got sword (mode=' + G.state.mode + ', sword=' + G.state.link.hasSword + ')');

  // leave cave (walk down off bottom)
  keydown('ArrowDown'); frames(120); keyup('ArrowDown');
  frames(10);

  // swing sword a bunch
  for (let i = 0; i < 5; i++) { keydown('KeyZ'); frames(3); keyup('KeyZ'); frames(15); }

  // drop a bomb
  keydown('KeyX'); frames(2); keyup('KeyX'); frames(90);

  // roam the overworld in all directions to exercise scroll transitions
  const dirs = ['ArrowRight','ArrowUp','ArrowLeft','ArrowDown','ArrowLeft','ArrowUp','ArrowRight'];
  for (const d of dirs) { keydown(d); frames(200); keyup(d); frames(20); }

  // cycle B items
  keydown('ShiftLeft'); frames(2); keyup('ShiftLeft'); frames(4);

  // force into the dungeon programmatically by navigating to the dungeon screen
  // (screen '1,0' has the 'D' entrance). Drive enough frames regardless.
  frames(60);

  // simulate taking damage to 0 via repeated hurt to exercise gameover path
  const link = G.state.link;
  for (let i = 0; i < 20 && G.state.mode !== 'gameover'; i++) {
    link.invuln = 0; link.knock = null;
    link.hurt(G.state, 2, link.x + 40, link.y);
    frames(2);
  }
  // restart from gameover
  if (G.state.mode === 'gameover') { keydown('Enter'); frames(3); keyup('Enter'); }
  frames(30);

  // ---- deterministic integration checks via test hooks ----
  // restart clean
  G._test.startGame(); frames(2);
  assert(G.state.mode === 'overworld', 'restart -> overworld');

  // sword cave: stand link on the 'C' tile, tick to enter
  let lk = G.state.link;
  lk.x = 7 * 16; lk.y = 2 * 16; frames(2);
  assert(G.state.mode === 'cave', 'entered sword cave, got ' + G.state.mode);
  // walk onto the sword item
  lk.x = 7 * 16 + 4; lk.y = 4 * 16; frames(3);
  assert(lk.hasSword === true, 'got the wooden sword');
  // exit cave by walking out the bottom gap (real path), then verify NOT stuck
  lk.x = 7 * 16; lk.y = 176 - 4; frames(3);
  assert(G.state.mode === 'overworld', 'exited cave -> overworld, got ' + G.state.mode);
  // bug regression: Link must land on open ground and be able to move
  lk = G.state.link;
  const underFeet = G.state.solidAt(lk.x + 8, lk.y + 12);
  assert(!underFeet, 'cave exit: Link not standing in a wall (feet solid=' + underFeet + ')');
  const py = lk.y;
  keydown('ArrowDown'); frames(8); keyup('ArrowDown');
  const moved = Math.abs(G.state.link.y - py) > 0.5 || (G.state.mode !== 'overworld');
  assert(moved, 'cave exit: Link can move after exiting (y ' + py + ' -> ' + G.state.link.y + ')');

  // dungeon: enter level 1, navigate to key room, grab key, then boss room
  G._test.enterDungeon(1); frames(2);
  assert(G.state.mode === 'dungeon' && G.state.level, 'in dungeon level ' + (G.state.level && G.state.level.id));

  // key room (1,1)
  G._test.loadDungeonRoom(1, 1, [2 * 16, 5 * 16]); frames(2);
  const keyItem = G.state.entities.find(e => e.item === 'key');
  assert(keyItem, 'key item present in key room');
  lk = G.state.link; lk.x = keyItem.x; lk.y = keyItem.y; frames(3);
  assert(lk.keys >= 1, 'picked up key, keys=' + lk.keys);

  // item room (3,1) -> L1 item is the boomerang (enter from the side door)
  G._test.loadDungeonRoom(3, 1, [2 * 16, 5 * 16]); frames(2);
  const mainItem = G.state.entities.find(e => e.item === 'boomerang');
  assert(mainItem, 'L1 boomerang item present');
  lk.x = mainItem.x; lk.y = mainItem.y; frames(3);
  assert(lk.hasBoomerang === true, 'got boomerang');

  // raft must be obtainable (level 6 is gated behind it) — prove the cave grants it
  G.state.mode = 'overworld';
  G._test.enterCave('raft', { c: 7, r: 2 }); frames(2);
  lk = G.state.link; lk.x = 7 * 16; lk.y = 4 * 16; frames(3);
  assert(lk.hasRaft === true, 'raft cave grants the raft (gates level 6)');

  // helper: beat a dungeon's boss and grab its triforce piece
  const NUM_DUNGEONS = sandbox.Dungeon.count;
  function bossRoomOf(level) {
    for (const k in level.rooms) if (level.rooms[k] && level.rooms[k].boss) return k.split(',').map(Number);
    return [2, 0];
  }
  function beatDungeon(n) {
    G._test.enterDungeon(n); frames(2);
    assert(G.state.mode === 'dungeon' && G.state.level && G.state.level.id === n,
      'entered dungeon ' + n + ' (mode=' + G.state.mode + ')');
    const [bc, br] = bossRoomOf(G.state.level);
    G._test.loadDungeonRoom(bc, br, [3 * 16, 5 * 16]); frames(2);
    const boss = G.state.entities.find(e => e.boss);
    assert(boss, 'L' + n + ' boss present');
    if (boss.etype === 'dodongo') {
      // sword must clink off (immune), then feed it bombs
      boss.hurt(G.state, 2, boss.x + 50, boss.y); frames(1);
      assert(boss.alive !== false && boss.hp > 0, 'L' + n + ' dodongo shrugs off the sword');
      for (let i = 0; i < 30 && boss.alive !== false; i++) {
        boss.dir = 'left'; boss.stun = 0; boss.swallow = 0;
        G.state.entities.push(sandbox.Entities.makeBomb(boss.x + 5 - 16, boss.y + 2));
        frames(2);
      }
    } else if (boss.etype === 'manhandla') {
      for (let i = 0; i < 120 && boss.alive !== false; i++) {
        boss.flash = 0;
        for (const h of boss.heads) if (h.hp > 0) boss.hurt(G.state, 2, boss.x + 8 + h.dx, boss.y + 8 + h.dy);
        frames(1);
      }
    } else {
      for (let i = 0; i < 80 && boss.alive !== false; i++) { boss.flash = 0; boss.hurt(G.state, 2, boss.x + 50, boss.y); frames(1); }
    }
    assert(boss.alive === false, 'L' + n + ' boss (' + (boss.etype || 'aquamentus') + ') defeated (hp left=' + boss.hp + ')');
    frames(3);
    const tri = G.state.entities.find(e => e.item === 'triforce');
    assert(tri, 'L' + n + ' triforce appeared');
    const pl = G.state.link; pl.x = tri.x; pl.y = tri.y; frames(3);
  }
  // beat every dungeon; only the last should trigger the win
  for (let n = 1; n <= NUM_DUNGEONS; n++) {
    beatDungeon(n);
    if (n < NUM_DUNGEONS) {
      assert(G.state.triforces === n && G.state.mode === 'overworld',
        'after L' + n + ': ' + n + ' pieces, back in overworld (mode=' + G.state.mode + ', tri=' + G.state.triforces + ')');
    } else {
      assert(G.state.triforces === n && G.state.mode === 'win',
        'after L' + n + ': ' + n + ' pieces -> WIN (mode=' + G.state.mode + ')');
    }
  }

  console.log('INTEGRATION OK — sword cave, raft, ' + NUM_DUNGEONS + ' dungeons, key, boomerang, bosses, triforce -> win all verified');

  // ---- coverage: load EVERY overworld screen + dungeon room + cave kind ----
  G._test.startGame(); frames(1);
  const COLS_W = sandbox.World.COLS_W, ROWS_W = sandbox.World.ROWS_W;
  const expectScreens = COLS_W * ROWS_W;
  let screenCount = 0;
  for (let r = 0; r < ROWS_W; r++) for (let c = 0; c < COLS_W; c++) {
    assert(G._test.loadOverworld(c, r), 'overworld screen ' + c + ',' + r + ' loads');
    screenCount++;
    G.state.link.x = 7 * 16; G.state.link.y = 8 * 16;
    frames(6);   // tick generated + authored enemies; must not throw
  }
  assert(screenCount === expectScreens, 'all ' + expectScreens + ' overworld screens load (got ' + screenCount + ')');
  // screens just outside the grid must NOT load (bounds are real)
  assert(!G._test.loadOverworld(COLS_W, 0) && !G._test.loadOverworld(0, ROWS_W),
    'out-of-bounds screens correctly rejected');

  let roomCount = 0, expectedRooms = 0;
  for (let n = 1; n <= NUM_DUNGEONS; n++) {
    const lvl = sandbox.Dungeon.level(n);
    G.state.level = lvl;
    expectedRooms += Object.keys(lvl.rooms).length;
    for (const k in lvl.rooms) {
      const [c, r] = k.split(',').map(Number);
      assert(G._test.loadDungeonRoom(c, r, [7 * 16, 8 * 16]), 'L' + n + ' room ' + k + ' loads');
      roomCount++;
      frames(8);
    }
  }
  assert(roomCount === expectedRooms && roomCount >= NUM_DUNGEONS * 6,
    'all ' + expectedRooms + ' dungeon rooms load, layouts are non-trivial (got ' + roomCount + ')');

  // every cave kind (incl. the new raft + heart-container caves)
  G._test.startGame(); frames(1);
  for (const kind of ['sword','candle','ring','fairy','money','raft','heartpiece','whitesword','firerod']) {
    G.state.mode = 'overworld';
    G._test.enterCave(kind, { c: 7, r: 2 });
    assert(G.state.mode === 'cave', 'cave kind ' + kind + ' enters cave');
    frames(6);
    G.state.link.x = 7 * 16; G.state.link.y = 4 * 16; frames(3);   // touch the item
  }
  assert(G.state.link.hasSword && G.state.link.hasCandle && G.state.link.hasRing &&
         G.state.link.hasRaft && G.state.link.maxHealth > 6,
    'cave items granted: sword=' + G.state.link.hasSword + ' candle=' + G.state.link.hasCandle +
    ' ring=' + G.state.link.hasRing + ' raft=' + G.state.link.hasRaft + ' maxHP=' + G.state.link.maxHealth);

  console.log('COVERAGE OK — ' + expectScreens + ' screens, ' + expectedRooms +
    ' dungeon rooms, 9 cave kinds, all enemy types ticked');

  // ---- save / continue round-trip ----
  G._test.startGame(); frames(1);
  const L0 = G.state.link;
  assert(L0.maxHealth === 18 && L0.health === 18, 'link starts with 9 hearts (18 half-hearts)');
  assert(L0.hasShield === true, 'link starts with the shield');
  L0.rupees = 42; L0.hasBoomerang = true; L0.hasSword = true; L0.swordDmg = 2;
  G.state.taken.add('unit-test-item'); G.state.revealed.add('3,1');
  G.state.col = 5; G.state.row = 4; G.state.mode = 'overworld';
  G._test.saveGame();
  assert(G._test.hasSave(), 'save written to localStorage');
  G._test.startGame(); frames(1);   // wipe to fresh state
  assert(G.state.link.rupees === 0 && !G.state.link.hasBoomerang, 'new game resets state');
  assert(G._test.loadGame(), 'loadGame succeeds');
  const L1 = G.state.link;
  assert(L1.rupees === 42 && L1.hasBoomerang && L1.hasSword && L1.swordDmg === 2,
    'link restored: rupees=' + L1.rupees + ' boomerang=' + L1.hasBoomerang + ' swordDmg=' + L1.swordDmg);
  assert(G.state.taken.has('unit-test-item') && G.state.revealed.has('3,1'),
    'taken/revealed sets restored (room clears are per-visit by design)');
  assert(G.state.col === 5 && G.state.row === 4, 'position restored: ' + G.state.col + ',' + G.state.row);
  console.log('SAVE OK — save/continue round-trip verified');

  // ---- v2 mechanics: secrets, shutters, push blocks, dark rooms, pause ----
  const EN = sandbox.Entities;

  // bombable wall: screen 0,0 has 'H' at row 3, col 8 -> bomb reveals a cave
  G._test.startGame(); frames(1);
  G._test.loadOverworld(0, 0, [7 * 16, 8 * 16]); frames(1);
  assert(G.state.grid[3][8] === 'H', 'secret wall present on 0,0');
  G.state.onBombBlast(8 * 16 + 8, 3 * 16 + 8); frames(1);
  assert(G.state.grid[3][8] === 'C' && G.state.revealed.has('0,0'),
    'bomb reveals hidden cave (H -> C, revealed persisted)');

  // burnable tree: screen 5,3 has 'U' at row 7, col 4 -> flame reveals stairs
  G._test.loadOverworld(5, 3, [7 * 16, 8 * 16]); frames(1);
  assert(G.state.grid[7][4] === 'U', 'secret tree present on 5,3');
  G.state.entities.push(EN.makeProjectile('flame', 4 * 16, 7 * 16, 'up',
    { vx: 0, vy: 0, speed: 0, damage: 1, life: 30, fromEnemy: false }));
  frames(2);
  assert(G.state.grid[7][4] === 'S', 'flame burns hidden tree (U -> S stairs)');

  // shutter room (clear): L1 room 3,1 opens its Z doors when enemies die
  G._test.enterDungeon(1); frames(1);
  G._test.loadDungeonRoom(3, 1, [7 * 16, 8 * 16]); frames(1);
  assert(G.state.grid[4][0] === 'Z', 'L1 item room shutters start closed');
  for (const en of G.state.entities) if (en.kind === 'enemy') { en._spawnDelay = 0; en.flash = 0; en.hurt(G.state, 99, en.x + 20, en.y); }
  frames(2);
  assert(G.state.grid[4][0] === 'F', 'shutters slam open on room clear');

  // dark room + candle: L2 room 1,1 is dark until a flame lights it
  G._test.enterDungeon(2); frames(1);
  G._test.loadDungeonRoom(1, 1, [7 * 16, 8 * 16]); frames(1);
  assert(G.state.dark === true, 'L2 side room is dark');
  G.state.entities.push(EN.makeProjectile('flame', 60, 60, 'up',
    { vx: 0, vy: 0, speed: 0, damage: 1, life: 30, fromEnemy: false }));
  frames(2);
  assert(G.state.dark === false, 'flame lights the dark room');

  // push block: L3 room 1,1 — shoving the block opens the shutters
  G._test.enterDungeon(3); frames(1);
  G._test.loadDungeonRoom(1, 1, [7 * 16, 9 * 16]); frames(1);
  assert(G.state.grid[5][7] === 'p', 'push block present');
  assert(G.state.grid[0][7] === 'Z', 'push-room shutters start closed');
  G.state.link.x = 7 * 16; G.state.link.y = 6 * 16 + 2; G.state.link.dir = 'up';
  keydown('ArrowUp'); frames(30); keyup('ArrowUp');
  assert(G.state.grid[5][7] === 'F' && G.state.grid[4][7] === 'B',
    'block slides one tile when shoved');
  assert(G.state.grid[0][7] === 'F', 'push opens the shutters');

  // pause / inventory screen round-trip
  G._test.startGame(); frames(1);
  keydown('Enter'); frames(2); keyup('Enter');
  assert(G.state.mode === 'pause', 'START pauses to inventory (mode=' + G.state.mode + ')');
  keydown('Enter'); frames(2); keyup('Enter');
  assert(G.state.mode === 'overworld', 'START resumes play');

  // overworld enemies respawn on re-entry (world never goes permanently quiet)
  G._test.loadOverworld(0, 1, [7 * 16, 8 * 16]); frames(1);
  for (const en of G.state.entities) if (en.kind === 'enemy') { en._spawnDelay = 0; en.flash = 0; en.hurt(G.state, 99, en.x, en.y); }
  frames(2);
  G._test.loadOverworld(1, 1, [7 * 16, 8 * 16]); frames(1);
  G._test.loadOverworld(0, 1, [7 * 16, 8 * 16]); frames(1);
  assert(G.state.entities.some(e => e.kind === 'enemy'), 'overworld enemies respawn on revisit');

  console.log('V2 OK — secrets (bomb+burn), shutters, dark rooms, push blocks, pause, respawn verified');

  // final long idle + movement to ensure stability
  G._test.startGame();
  keydown('ArrowDown'); frames(100); keyup('ArrowDown');
  frames(200);

  console.log('SMOKE OK — frames run, mode=' + G.state.mode +
    ', hasSword=' + G.state.link.hasSword +
    ', rupees=' + G.state.link.rupees + ', bombs=' + G.state.link.bombs +
    ', health=' + G.state.link.health + '/' + G.state.link.maxHealth);
} catch (e) {
  console.error('RUNTIME ERROR:', e.stack);
  process.exit(1);
}
