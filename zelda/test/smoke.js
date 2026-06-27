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
  function beatDungeon(n) {
    G._test.enterDungeon(n); frames(2);
    assert(G.state.mode === 'dungeon' && G.state.level && G.state.level.id === n,
      'entered dungeon ' + n + ' (mode=' + G.state.mode + ')');
    G._test.loadDungeonRoom(2, 0, [3 * 16, 5 * 16]); frames(2);
    const boss = G.state.entities.find(e => e.boss);
    assert(boss, 'L' + n + ' boss present');
    for (let i = 0; i < 60 && boss.alive !== false; i++) { boss.flash = 0; boss.hurt(G.state, 2, boss.x + 50, boss.y); frames(1); }
    assert(boss.alive === false, 'L' + n + ' boss defeated (hp left=' + boss.hp + ')');
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

  let roomCount = 0;
  for (let n = 1; n <= NUM_DUNGEONS; n++) {
    const lvl = sandbox.Dungeon.level(n);
    G.state.level = lvl;
    for (const k in lvl.rooms) {
      const [c, r] = k.split(',').map(Number);
      assert(G._test.loadDungeonRoom(c, r, [7 * 16, 8 * 16]), 'L' + n + ' room ' + k + ' loads');
      roomCount++;
      frames(8);
    }
  }
  assert(roomCount === NUM_DUNGEONS * 5, 'all ' + (NUM_DUNGEONS * 5) + ' dungeon rooms load (got ' + roomCount + ')');

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

  console.log('COVERAGE OK — ' + expectScreens + ' screens, ' + (NUM_DUNGEONS * 5) +
    ' dungeon rooms, 9 cave kinds, all enemy types ticked');

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
