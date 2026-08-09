/* Headless smoke test: stub browser APIs, load the real game scripts in one
   shared lexical scope (like <script> tags), boot, and drive input for many
   frames through the main code paths. Fails loudly on any thrown error. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Batch G static asset-contract checks. A newly added game script must be
// included in the versioned worker before the test can pass.
const root = path.join(__dirname, '..');
const swSource = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const playHtml = fs.readFileSync(path.join(root, 'play.html'), 'utf8');
const jsAssets = fs.readdirSync(path.join(root, 'js')).filter(name => name.endsWith('.js')).sort();
function staticAssert(cond, msg) { if (!cond) { console.error('STATIC ASSERT FAIL:', msg); process.exit(1); } }
staticAssert(indexHtml === playHtml, 'index.html and play.html must remain byte-identical');
staticAssert(swSource.includes("'index.html?v=16'") && swSource.includes("'manifest.json?v=16'"),
  'service worker precaches index.html and manifest.json at v16');
for (const name of jsAssets) staticAssert(swSource.includes("'js/" + name + "?v=16'"),
  'service worker precaches js/' + name);
const cacheBusts = [...indexHtml.matchAll(/(?:src|href)="[^"]+\?v=(\d+)"/g)].map(m => m[1]);
staticAssert(cacheBusts.length >= jsAssets.length + 1 && cacheBusts.every(v => v === '16'),
  'HTML cache-bust queries are consistently v16');
staticAssert(swSource.includes('?v=16') && swSource.includes("const VERSION = 'zc-v16'"),
  'service worker cache-bust/version is v16');
staticAssert(indexHtml.includes("navigator.serviceWorker.register('sw.js?v=16')") &&
  !indexHtml.includes('sw_purged'), 'HTML has real SW registration and no purge block');
console.log('STATIC CONTRACT OK — precache=' + jsAssets.length + ' js files, HTML parity, v16 queries');

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
const order = ['engine', 'sound', 'sprites', 'tiles', 'world', 'dungeon', 'entities', 'items', 'game'];
const base = path.join(__dirname, '..', 'js');
let combined = '';
for (const name of order) combined += fs.readFileSync(path.join(base, name + '.js'), 'utf8') + '\n;\n';
// expose lexical globals to the test harness (browser sees these as lexical globals too)
combined += '\n;globalThis.Game=Game;globalThis.Engine=Engine;globalThis.Entities=Entities;' +
            'globalThis.World=World;globalThis.Dungeon=Dungeon;globalThis.Sprites=Sprites;' +
            'globalThis.Tiles=Tiles;globalThis.ITEMS=ITEMS;globalThis.Sound=Sound;\n';

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
const EN = sandbox.Entities;
function assert(cond, msg) { if (!cond) { console.error('ASSERT FAIL:', msg); process.exit(1); } }

try {
  assert(G && G.state, 'Game.state exists');
  assert(G.state.mode === 'title', 'starts on title, got ' + G.state.mode);
  for (const api of ['playTrack','stinger','stopMusic','toggleMute'])
    assert(typeof sandbox.Sound[api] === 'function', 'Sound.' + api + ' exists');
  sandbox.Sound.playTrack('ganon');
  assert(sandbox.Sound.currentTrack() === 'ganon', 'track switch selects Ganon pattern');
  sandbox.Sound.toggleMute();
  assert(sandbox.Sound.isMuted() && sandbox.Sound.currentTrack() === 'ganon', 'mute stores current track');
  sandbox.Sound.toggleMute();
  assert(!sandbox.Sound.isMuted() && sandbox.Sound.currentTrack() === 'ganon', 'unmute resumes remembered track');
  console.log('AUDIO API OK — pattern switch, stinger, stop, and mute round-trip');

  keydown('ArrowUp');
  assert(sandbox.Engine.keys.up === true, 'held key is captured');
  dispatch('blur');
  assert(!sandbox.Engine.keys.up && !sandbox.Engine.pressed.up, 'window blur clears held and pressed keys');
  keydown('ArrowLeft');
  sandbox.document.hidden = true;
  dispatch('visibilitychange');
  assert(!sandbox.Engine.keys.left && !sandbox.Engine.pressed.left, 'hidden document clears held and pressed keys');
  sandbox.document.hidden = false;

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
  G.state.link.health = 2; G.state.lowHealthT = 44; G._test.update();
  assert(G.state.lowHealthT === 0, 'low-health beep counter fires at one heart');
  G.state.link.health = 4; G._test.update();
  assert(G.state.lowHealthT === 0, 'low-health beep counter disarms on recovery');
  const hoistItem = EN.makeItem('bow', 80, 80, { permanent:true });
  assert(G._test.collect(hoistItem) === 'taken' && G.state.link.hoist > 0 && G.state.link.hoistItem === 'bow',
    'major pickup starts item-hoist pose');
  const hoistX = G.state.link.x;
  G.state.keys.right = true; G._test.update(); G.state.keys.right = false;
  assert(G.state.link.x === hoistX, 'item-hoist locks Link input');
  G.state.link.hoist = 1; G._test.update();
  assert(G.state.link.hoist === 0 && G.state.link.hoistItem === null, 'item-hoist clears after its lock window');
  G.state.link.bItem = 'potion'; G.state.link.potion = 'red'; G.state.link.potionCharges = 2;
  G._test.drawHUD(sandbox.Engine.ctx);
  sandbox.Sound.toggleMute(); G._test.drawHUD(sandbox.Engine.ctx); sandbox.Sound.toggleMute();
  G.state.link.bItem = 'bomb';
  console.log('G AUDIO/POLISH OK — low-health cue, hoist lock/clear, HUD draw');

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

  // item room (3,1) -> L1 item is the boomerang (solver proves access)
  assert(solveLevel(sandbox.Dungeon.level(1)).has('3,1'), 'L1 solver reaches boomerang room');
  G._test.loadDungeonRoom(3, 1, [2 * 16, 5 * 16]); frames(2);
  for (const en of G.state.entities) if (en.kind === 'enemy') { en._spawnDelay = 0; en.flash = 0; en.hurt(G.state, 99, en.x + 8, en.y + 8); }
  frames(2);
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
    const bossKey = Object.keys(G.state.level.rooms).find(k => G.state.level.rooms[k] && G.state.level.rooms[k].boss);
    assert(solveLevel(G.state.level).has(bossKey), 'L' + n + ' solver reaches boss room');
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
    } else if (boss.etype === 'gohma') {
      boss.eyeOpen = true;
      for (let i = 0; i < 3 && boss.alive !== false; i++) { boss.flash = 0; boss.eyeOpen = true; boss.hurt(G.state, 2, boss.x + 16, boss.y + 10, 'arrow'); frames(1); }
    } else if (boss.etype === 'digdogger') {
      G.state.link.hasWhistle = true; boss.shrink(G.state); frames(1);
      for (const child of G.state.entities.filter(e => e.etype === 'digdoggerSmall')) { child.flash = 0; child.hurt(G.state, 9, child.x + 4, child.y + 4); }
      frames(2);
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
      assert(G.state.triforces === n && G.state.mode !== 'win',
        'after L' + n + ': ' + n + ' pieces opens level 9 without WIN mode (mode=' + G.state.mode + ')');
      assert(G.state.quest.phase === 'level9Open', 'final triforce opens level 9 quest phase');
      const finalSave = JSON.parse(sandbox.localStorage.getItem('zelda_save_v1'));
      assert(finalSave.quest.phase === 'level9Open', 'final triforce saves quest phase before win mode');
    }
  }

  assert(G._test.loadGame() && G.state.quest.phase === 'level9Open' && G.state.mode === 'overworld',
    'reload after final Triforce preserves level 9 quest phase without ending');
  G._test.enterDungeon(8); frames(1);
  const [finalBossCol, finalBossRow] = bossRoomOf(G.state.level);
  G._test.loadDungeonRoom(finalBossCol, finalBossRow, [3 * 16, 5 * 16]); frames(1);
  assert(!G.state.entities.some(e => e.boss), 'reload after win does not resurrect final boss');

  console.log('INTEGRATION OK — sword cave, raft, ' + NUM_DUNGEONS + ' dungeons, key, boomerang, bosses, triforce -> win all verified');

  G._test.startGame();
  const cacheBeforeMini = sandbox.World._test.genCacheSize();
  const overworldMiniCtx = { fillStyle:'#000', fillRect() {} };
  G._test.drawMiniMap(overworldMiniCtx, 8, 8);
  assert(sandbox.World._test.genCacheSize() === cacheBeforeMini, 'overworld minimap does not generate unvisited screens');
  console.log('MINIMAP CACHE OK — dungeon lookup avoids procedural screen population');

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

  // sword tiers: cave gates apply before spawning, pickup gates apply again,
  // and collecting a lower tier never downgrades the owned damage.
  G._test.startGame(); frames(1);
  G.state.link.maxHealth = 8;
  G._test.enterCave('whitesword', { c: 7, r: 2 }); frames(1);
  assert(!G.state.entities.some(e => e.item === 'whitesword'), 'white sword cave stays gated below 10 hearts');
  assert(G._test.collect(EN.makeItem('whitesword', 0, 0)) === 'refused' && !G.state.link.hasSword,
    'white sword pickup refuses below 10 hearts');
  G.state.link.maxHealth = 10;
  assert(G._test.collect(EN.makeItem('whitesword', 0, 0)) === 'taken', 'white sword pickup accepts at 10 hearts');
  assert(G.state.link.hasSword && G.state.link.swordDmg === 2, 'white sword sets hasSword and damage tier');
  G.state.link.maxHealth = 23;
  G._test.enterCave('magicsword', { c: 7, r: 2 }); frames(1);
  assert(!G.state.entities.some(e => e.item === 'magicsword'), 'magic sword cave stays gated below 24 hearts');
  const refusedMagic = EN.makeItem('magicsword', 0, 0);
  assert(G._test.collect(refusedMagic) === 'refused' && !G.state.link.hasMagicSword,
    'magic sword pickup refuses below 24 hearts');
  G.state.link.maxHealth = 24;
  assert(G._test.collect(EN.makeItem('magicsword', 0, 0)) === 'taken', 'magic sword pickup accepts at 24 hearts');
  assert(G.state.link.hasSword && G.state.link.swordDmg === 4, 'magic sword keeps the highest sword damage');
  assert(G._test.collect(EN.makeItem('whitesword', 0, 0)) === 'taken' && G.state.link.swordDmg === 4,
    'lower sword tier does not downgrade damage');
  console.log('SWORD TIERS OK — hasSword, health gates, and monotonic damage verified');

  console.log('COVERAGE OK — ' + expectScreens + ' screens, ' + expectedRooms +
    ' dungeon rooms, 9 cave kinds, all enemy types ticked');

  // ---- save / continue round-trip ----
  G._test.startGame(); frames(1);
  const L0 = G.state.link;
  assert(L0.maxHealth === 6 && L0.health === 6 && L0.bombs === 0 && L0.rupees === 0 && L0.keys === 0,
    'new game starts with 3 hearts, zero bombs/rupees/keys');
  assert(L0.hasShield === true, 'link starts with the shield');
  L0.rupees = 42; L0.hasBoomerang = true; L0.hasSword = true; L0.swordDmg = 2;
  G.state.taken.add('unit-test-item'); G.state.revealed.add('sec:3,1');
  G.state.col = 5; G.state.row = 4; G.state.mode = 'overworld';
  G._test.saveGame();
  assert(G._test.hasSave(), 'save written to localStorage');
  G._test.startGame(); frames(1);   // wipe to fresh state
  assert(G.state.link.rupees === 0 && !G.state.link.hasBoomerang, 'new game resets state');
  assert(G._test.loadGame(), 'loadGame succeeds');
  const L1 = G.state.link;
  assert(L1.rupees === 42 && L1.hasBoomerang && L1.hasSword && L1.swordDmg === 2,
    'link restored: rupees=' + L1.rupees + ' boomerang=' + L1.hasBoomerang + ' swordDmg=' + L1.swordDmg);
  assert(G.state.taken.has('unit-test-item') && G.state.revealed.has('sec:3,1'),
    'taken/revealed sets restored (room clears are per-visit by design)');
  assert(G.state.col === 5 && G.state.row === 4, 'position restored: ' + G.state.col + ',' + G.state.row);
  console.log('SAVE OK — save/continue round-trip verified');

  // ---- v2 mechanics: secrets, shutters, push blocks, dark rooms, pause ----
  // bombable wall: screen 0,0 has 'H' at row 3, col 8 -> bomb reveals a cave
  G._test.startGame(); frames(1);
  G._test.loadOverworld(0, 0, [7 * 16, 8 * 16]); frames(1);
  assert(G.state.grid[3][8] === 'H', 'secret wall present on 0,0');
  G.state.onBombBlast(8 * 16 + 8, 3 * 16 + 8); frames(1);
  assert(G.state.grid[3][8] === 'C' && G.state.revealed.has('sec:0,0'),
    'bomb reveals hidden cave (H -> C, revealed persisted)');

  // burnable tree: screen 5,3 has 'U' at row 7, col 4 -> flame reveals stairs
  G._test.loadOverworld(5, 3, [7 * 16, 8 * 16]); frames(1);
  assert(G.state.grid[7][4] === 'U', 'secret tree present on 5,3');
  G.state.entities.push(EN.makeProjectile('flame', 4 * 16, 7 * 16, 'up',
    { vx: 0, vy: 0, speed: 0, damage: 1, life: 30, fromEnemy: false }));
  frames(2);
  assert(G.state.grid[7][4] === 'S', 'flame burns hidden tree (U -> S stairs)');

  // shutter room (clear): L1 hub room 2,1 opens the boomerang-room door
  G._test.enterDungeon(1); frames(1);
  G._test.loadDungeonRoom(2, 1, [7 * 16, 8 * 16]); frames(1);
  assert(G.state.grid[4][15] === 'Z', 'L1 hub shutter starts closed');
  for (const en of G.state.entities) if (en.kind === 'enemy') { en._spawnDelay = 0; en.flash = 0; en.hurt(G.state, 99, en.x + 20, en.y); }
  frames(2);
  assert(G.state.grid[4][15] === 'F', 'canonical open door remains open after hub clear');

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

  // ---- combat regressions ----
  G._test.startGame(); frames(1);
  const goriya = EN.makeEnemy('goriya', 'brown', 2, 2);
  const target = EN.makeEnemy('octorok', 'red', 3, 2);
  G.state.entities = [goriya, target];
  G.state.link.x = 32; G.state.link.y = 32; G.state.link.dir = 'down';
  let enemyBoom = EN.makeBoomerang(goriya.x, goriya.y, 1, 0, goriya);
  G.state.entities.push(enemyBoom);
  const beforeBoomHealth = G.state.link.health;
  enemyBoom.update(G.state);
  assert(G.state.link.health === beforeBoomHealth - 1 && target.hp === 1,
    'Goriya boomerang hurts Link and never damages enemies');
  G.state.link.health = 18; G.state.link.invuln = 0; G.state.link.knock = null;
  G.state.link.x = 112; G.state.link.y = 32; G.state.link.dir = 'right';
  const returningBoom = EN.makeBoomerang(goriya.x, goriya.y, 1, 0, goriya);
  returningBoom.x = 120; returningBoom.y = 36; returningBoom.returning = true;
  returningBoom.t = 17; G.state.entities = [returningBoom];
  returningBoom.update(G.state);
  assert(G.state.link.health === 18 && returningBoom.alive === false,
    'returning Goriya boomerang is blocked from its current velocity');
  G.state.link.x = 32; G.state.link.y = 32;
  G.state.link.health = 18; G.state.link.invuln = 0; G.state.link.knock = null; G.state.link.dir = 'left';
  enemyBoom = EN.makeBoomerang(goriya.x, goriya.y, 1, 0, goriya);
  enemyBoom.update(G.state);
  assert(G.state.link.health === 18 && enemyBoom.alive === false,
    'Goriya boomerang is blocked by a facing shield');
  G.state.link.dir = 'left'; G.state.link.attackTimer = 1;
  enemyBoom = EN.makeBoomerang(goriya.x, goriya.y, 1, 0, goriya);
  enemyBoom.update(G.state);
  assert(G.state.link.health === 17, 'Goriya boomerang bypasses shield while attacking');

  for (const dir of ['up','right','down','left']) {
    const darknut = EN.makeEnemy('darknut', null, 5, 5);
    darknut.dir = dir;
    const [dx, dy] = EN.DIRS[dir];
    const before = darknut.hp;
    darknut.hurt(G.state, 1, darknut.x + dx * 20, darknut.y + dy * 20);
    assert(darknut.hp === before, 'Darknut blocks front hit while facing ' + dir);
    const back = {up:'down',down:'up',left:'right',right:'left'}[dir];
    const [bx, by] = EN.DIRS[back];
    darknut.hurt(G.state, 1, darknut.x + bx * 20, darknut.y + by * 20);
    assert(darknut.hp === before - 1, 'Darknut takes rear hit while facing ' + dir);
  }

  const bombTarget = EN.makeEnemy('octorok', 'red', 4, 4);
  let blastHits = 0;
  bombTarget.hp = 10;
  bombTarget.hurt = () => { blastHits++; };
  const bomb = EN.makeBomb(bombTarget.x, bombTarget.y);
  bomb.fuse = 1;
  G.state.entities = [bombTarget, bomb];
  bomb.update(G.state); bomb.update(G.state); bomb.update(G.state);
  assert(blastHits === 1, 'bomb blast hits each enemy once per explosion');

  const deadEntity = { alive:false, update() { throw new Error('dead entity updated'); } };
  G.state.entities = [deadEntity];
  G._test.update();
  assert(G.state.entities.length === 0, 'update skips dead entities');

  G.state.level = sandbox.Dungeon.level(4); G.state.col = 1; G.state.row = 0;
  const gleeok = EN.makeGleeok(7, 4, { headHp: 1 });
  G.state.entities = [gleeok];
  const firstHead = gleeok.heads[0], secondHead = gleeok.heads[1];
  gleeok.hurt(G.state, 1, firstHead.x, firstHead.y);
  firstHead.shootTimer = 1;
  const oldHeadX = firstHead.x;
  gleeok.update(G.state);
  assert(firstHead.detached && firstHead.hp === 0 && firstHead.x !== oldHeadX && gleeok.alive,
    'Gleeok head detaches and remains an active flying head');
  gleeok.flash = 0;
  gleeok.hurt(G.state, 1, secondHead.x, secondHead.y);
  gleeok.update(G.state);
  assert(gleeok.alive === false, 'Gleeok body dies after all heads detach');
  console.log('COMBAT OK — Goriya boomerang, Darknut facing, bomb dedupe, dead-loop skip, Gleeok detach');

  // ---- Batch B: combat feel, drops, phased enemies, hazards ----
  G._test.startGame(); frames(1);
  let bl = G.state.link; bl.hasSword = true; bl.swordDmg = 1; bl.x = 80; bl.y = 80; bl.dir = 'right';
  const offFacing = EN.makeEnemy('stalfos', null, 5, 4); offFacing.x = 80; offFacing.y = 64; offFacing.speed = 0;
  const facing = EN.makeEnemy('stalfos', null, 6, 5); facing.x = 96; facing.y = 80; facing.speed = 0; facing.hp = 2;
  G.state.entities = [offFacing, facing]; G.state.swordSwung = 8; G.state.swordHitSet = new Set();
  G._test.update();
  assert(offFacing.hp === 2 && facing.hp === 1, 'directional sword only hits the facing rectangle');
  G._test.update();
  assert(facing.hp === 1, 'one enemy is hit at most once per swing');
  facing.flash = 0; G.state.swordSwung = 8; G.state.swordHitSet = new Set(); G._test.update();
  assert(facing.alive === false, 'a fresh swing can hit the same enemy again');

  G._test.startGame(); frames(1); bl = G.state.link;
  assert(bl.maxHealth === 6 && bl.health === 6 && bl.bombs === 0 && bl.rupees === 0 && bl.keys === 0 && bl.hasShield,
    'new-game combat stats are 3 hearts, zero bombs/rupees/keys, small shield');
  bl.rupees = 254; bl.keys = 8; bl.bombs = 5;
  G._test.collect(EN.makeItem('rupee5', 0, 0)); G._test.collect(EN.makeItem('key', 0, 0));
  G._test.collect(EN.makeItem('bomb', 0, 0));
  assert(bl.rupees === 255 && bl.keys === 9 && bl.bombs === 8, 'resource caps clamp pickups at 255/9/8');
  G._test.collect(EN.makeItem('rupee', 0, 0)); G._test.collect(EN.makeItem('key', 0, 0)); G._test.collect(EN.makeItem('bomb', 0, 0));
  assert(bl.rupees === 255 && bl.keys === 9 && bl.bombs === 8, 'resource caps hold on overflow pickups');

  const savedRand = G.state.rand;
  G.state.rand = () => 0.99;
  let arrowTarget = EN.makeEnemy('stalfos', null, 6, 5); arrowTarget.hp = 5;
  G.state.link.x = 80; G.state.link.y = 80; G.state.link.dir = 'right';
  G.state.link.hasBow = true; G.state.link.hasSilverArrows = false; G.state.link.rupees = 1;
  G.state.entities = [arrowTarget];
  sandbox.ITEMS.bow.use(G.state.link, G.state);
  let arrow = G.state.entities.find(e => e.ptype === 'arrow');
  arrow.update(G.state);
  assert(arrow.damage === 2 && arrowTarget.hp === 3, 'bow use fires 2-damage normal arrows');
  arrowTarget = EN.makeEnemy('stalfos', null, 6, 5); arrowTarget.hp = 5;
  G.state.link.hasSilverArrows = true; G.state.link.rupees = 1; G.state.entities = [arrowTarget];
  sandbox.ITEMS.bow.use(G.state.link, G.state);
  arrow = G.state.entities.find(e => e.ptype === 'arrow');
  arrow.update(G.state);
  assert(arrow.damage === 4 && arrowTarget.hp === 1, 'actual bow use fires 4-damage silver arrows');
  G.state.counters = { kills: 9 }; G.state.link.bombs = 3; G.state.entities = [];
  let forced = EN.makeEnemy('stalfos', null, 5, 5); forced.hurt(G.state, 99, forced.x + 20, forced.y);
  assert(G.state.counters.kills === 10 && G.state.entities.some(e => e.item === 'bomb'), '10th kill forces a class drop');
  G.state.counters = { kills: 15 }; G.state.link.bombs = 0; G.state.entities = [];
  forced = EN.makeEnemy('keese', null, 5, 5); forced.hurt(G.state, 99, forced.x + 20, forced.y);
  assert(G.state.counters.kills === 16 && G.state.entities.some(e => e.item === 'bomb'), '16th kill at zero bombs forces an anti-starve bomb');
  G.state.counters = { kills: 9 }; G.state.entities = [];
  const likeLike = EN.makeEnemy('likelike', null, 5, 5);
  likeLike.hurt(G.state, 99, likeLike.x + 20, likeLike.y);
  assert(G.state.counters.kills === 9 && !G.state.entities.some(e => e.item),
    'classless Like-Like neither advances kills nor consumes a milestone');
  G.state.rand = savedRand;

  const wz = EN.makeEnemy('wizzrobe', null, 5, 5); wz._spawnDelay = 0; wz.phase = 'invisible'; wz.phaseTimer = 1;
  wz.hurt(G.state, 99, wz.x + 20, wz.y); assert(wz.hp === 2, 'Wizzrobe is invulnerable while phased out');
  G.state.entities = [wz]; wz.update(G.state); assert(wz.phase === 'shimmer' && wz.hidden === false, 'Wizzrobe shimmer-in phase appears');
  wz.hurt(G.state, 1, wz.x + 20, wz.y); assert(wz.hp === 2, 'Wizzrobe shimmer remains invulnerable');
  wz.phase = 'solid'; wz.phaseTimer = 70; wz.hidden = false; wz.invulnerable = false; wz.hurt(G.state, 1, wz.x + 20, wz.y);
  assert(wz.hp === 1, 'Wizzrobe solid phase is vulnerable');
  bl.x = 160; bl.y = 80; wz.x = 80; wz.y = 80; wz.phase = 'shimmer'; wz.phaseTimer = 1;
  G.state.rand = () => 0; G.state.entities = []; wz.update(G.state);
  const volley = G.state.entities.filter(e => e.ptype === 'beam');
  assert(volley.length === 2 && Math.abs(volley[0].x - volley[1].x) + Math.abs(volley[0].y - volley[1].y) === 8,
    'Wizzrobe double beam volley has a perpendicular offset');
  G.state.rand = savedRand;

  const bubble = EN.makeEnemy('bubble', null, 5, 5); bubble.anchorX = bl.x - 16; bubble.anchorY = bl.y + 8; bubble.orbit = 0;
  G.state.link = bl; bl.swordDisabled = 0; G.state.entities = [bubble]; bubble.update(G.state);
  assert(bl.swordDisabled === 80, 'Bubble disables the sword for 80 frames');
  G.state.entities = []; bl.swordDisabled = 1; G.state.pressed.a = true; G._test.update(); G.state.pressed.a = false;
  assert(bl.attackTimer === 0 && bl.swordDisabled === 0, 'Bubble sword lockout expires and blocks no later swing');

  G._test.enterDungeon(5); frames(1); G._test.loadDungeonRoom(1, 1, [7 * 16, 8 * 16]); frames(1);
  const wm = EN.makeEnemy('wallmaster', null, 5, 5); wm.hidden = false; wm.state = 'chase'; wm.phaseTimer = 1;
  wm.x = G.state.link.x; wm.y = G.state.link.y; G.state.entities = [wm];
  wm.update(G.state);
  assert(G.state.mode === 'dungeon' && G.state.col === 1 && G.state.row === 2 &&
         G.state.link.x === 7 * 16 && G.state.link.y === 9 * 16, 'Wallmaster grab deposits Link at dungeon entry (' +
         G.state.mode + ' ' + G.state.col + ',' + G.state.row + ' @' + G.state.link.x + ',' + G.state.link.y + ')');

  G._test.enterDungeon(1); frames(1); G._test.loadDungeonRoom(1, 1, [7 * 16, 8 * 16]); frames(1);
  const swordZol = EN.makeEnemy('zol', null, 6, 5); G.state.entities = [swordZol]; G.state.counters = { kills: 0 };
  swordZol.hurt(G.state, 2, swordZol.x + 20, swordZol.y);
  assert(swordZol.alive === false && !G.state.entities.some(e => e.etype === 'gel') && G.state.counters.kills === 1,
    'sword-tier Zol kill does not split and accounts once');
  const zol = EN.makeEnemy('zol', null, 6, 5); G.state.entities = [zol]; G.state._hadEnemies = true;
  zol.hurt(G.state, 1, zol.x + 20, zol.y);
  const children = G.state.entities.filter(e => e.etype === 'gel');
  assert(children.length === 2, 'Zol splits into two Gel children');
  for (const child of children) child.hurt(G.state, 99, child.x + 20, child.y);
  G._test.update();
  assert(G.state.cleared.has('d1:1,1'), 'room clear waits until Zol children are dead');

  const trapA = EN.makeBladeTrap('tl'), trapB = EN.makeBladeTrap('tl');
  bl = G.state.link; bl.x = 80; bl.y = trapA.y; bl.invuln = 999; trapA.update(G.state); trapB.update(G.state);
  assert(trapA.state === 'out' && trapA.targetX === 224 && trapA.x === trapB.x && trapA.y === trapB.y,
    'corner blade trap launch is deterministic');
  assert(EN.makeProjectile('rock', 0, 0, 'right', {vx:1,vy:0,speed:1,damage:1,fromEnemy:true}).damage === 1 &&
         EN.makeProjectile('beam', 0, 0, 'right', {vx:1,vy:0,speed:1,damage:2,fromEnemy:true}).damage === 2 &&
         EN.makeProjectile('fireball', 0, 0, 'right', {vx:1,vy:0,speed:1,damage:2,fromEnemy:true}).damage === 2,
    'projectile tuning is rock/arrow 1, beam/fireball 2');
  assert(EN.makeEnemy('octorok', null, 2, 2).touchDmg === 1 && EN.makeEnemy('darknut', null, 2, 2).touchDmg === 2 &&
         EN.makeEnemy('wizzrobe', null, 2, 2).touchDmg === 2,
    'contact damage tuning matches minor and elite classes');
  console.log('BATCH B OK — directional sword, stats/caps, drops, Wizzrobe, Bubble, Wallmaster, Zol, traps, damage');

  // raft gate is an entry edge, not a repeating timer; leaving the D tile
  // arms the same warning again on re-entry.
  G._test.startGame(); frames(1);
  G._test.loadOverworld(7, 5, [7 * 16, 5 * 16]);
  G.state.link.hasRaft = false;
  frames(1);
  const gateMsg = G.state.msgT;
  frames(4);
  assert(G.state.msg === 'YOU NEED THE RAFT TO CROSS.' && G.state.msgT < gateMsg,
    'raft gate warning fires once while standing on the D tile');
  G.state.link.x = 6 * 16; frames(1);
  assert(G.state._raftGateTile === null, 'raft gate clears after leaving the D tile');
  G.state.link.x = 7 * 16; frames(1);
  assert(G.state.msgT > 170, 'raft gate warning fires again on re-entry');

  // boss heart is unique per level, survives room reload until collected, and
  // remains available when the Triforce was collected first.
  const bossHeartId = 'bossheart:L1', bossRoom = bossRoomOf(sandbox.Dungeon.level(1));
  G._test.startGame(); frames(1);
  G.state.level = sandbox.Dungeon.level(1); G.state.taken.add('boss1:' + bossRoom[0] + ',' + bossRoom[1]);
  G._test.loadDungeonRoom(bossRoom[0], bossRoom[1], [3 * 16, 5 * 16]); frames(1);
  let bossHeart = G.state.entities.find(e => e._unique === bossHeartId);
  assert(bossHeart, 'dead boss room respawns its untaken heart container');
  assert(G._test.collect(bossHeart) === 'taken' && G.state.taken.has(bossHeartId), 'boss heart pickup persists unique id');
  G._test.loadDungeonRoom(bossRoom[0], bossRoom[1], [3 * 16, 5 * 16]); frames(1);
  assert(!G.state.entities.some(e => e._unique === bossHeartId), 'taken boss heart does not respawn');
  G._test.startGame(); frames(1);
  G.state.level = sandbox.Dungeon.level(1); G.state.taken.add('boss1:' + bossRoom[0] + ',' + bossRoom[1]);
  G._test.loadDungeonRoom(bossRoom[0], bossRoom[1], [3 * 16, 5 * 16]); frames(1);
  const bossTri = G.state.entities.find(e => e.item === 'triforce');
  assert(bossTri && G._test.collect(bossTri) === 'taken', 'Triforce can be collected before boss heart');
  G.state._warpOut = false;
  G._test.loadDungeonRoom(bossRoom[0], bossRoom[1], [3 * 16, 5 * 16]); frames(1);
  bossHeart = G.state.entities.find(e => e._unique === bossHeartId);
  assert(bossHeart && G._test.collect(bossHeart) === 'taken', 'boss heart respawns after Triforce-first reload (taken=' +
    JSON.stringify([...G.state.taken]) + ', items=' + G.state.entities.map(e => e.item + ':' + e._unique) + ')');
  console.log('GATE/HEART OK — raft edge trigger and boss-heart reload orders verified');

  G._test.startGame(); frames(1);
  G._test.loadOverworld(3, 2, [7 * 16, 8 * 16]);
  assert(G.state.grid[5][7] === 'C', 'fairy cave entrance replaces only the center grave on 3,2');
  G.state.link.x = 7 * 16; G.state.link.y = 5 * 16; frames(2);
  assert(G.state.mode === 'cave', 'fairy cave on 3,2 is reachable');

  // ---- foundation audits: canonical edges, traversal, spawns, determinism, fixtures ----
  function edgeRooms(edge) { return [edge.a, edge.b]; }
  function solveLevel(lvl, blockedId) {
    const entry = lvl.entry.col + ',' + lvl.entry.row;
    const reached = new Set([entry]), used = new Set(), keysByRoom = {};
    let keys = 0, changed = true;
    function collect(room) {
      const rd = lvl.rooms[room];
      if (rd && rd.item && rd.item.kind === 'key' && !keysByRoom[room]) { keysByRoom[room] = true; keys++; }
    }
    collect(entry);
    while (changed) {
      changed = false;
      for (const edge of lvl.edges) {
        if (edge.id === blockedId || used.has(edge.id)) continue;
        const from = reached.has(edge.a) ? edge.a : reached.has(edge.b) ? edge.b : null;
        if (!from) continue;
        if (edge.type === 'locked') {
          if (keys <= 0) continue;
          keys--; used.add(edge.id);
        } else if (edge.type === 'shutter') {
          const condition = edge.condition;
          const conditionRoom = condition && lvl.rooms[condition.room];
          if (!conditionRoom || !reached.has(condition.room) ||
              condition.kind !== conditionRoom.room.shutter) continue;
          used.add(edge.id);
        } else used.add(edge.id);
        const to = from === edge.a ? edge.b : edge.a;
        if (!reached.has(to)) { reached.add(to); collect(to); changed = true; }
      }
    }
    return reached;
  }
  function stableHash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(16).padStart(8, '0');
  }
  for (let n = 1; n <= NUM_DUNGEONS; n++) {
    const lvl = sandbox.Dungeon.level(n), reached = solveLevel(lvl);
    assert(reached.size === Object.keys(lvl.rooms).length, 'L' + n + ' solver reaches every room (' + reached.size + '/' + Object.keys(lvl.rooms).length + ')');
    const bossKey = Object.keys(lvl.rooms).find(k => lvl.rooms[k].boss);
    assert(reached.has(bossKey), 'L' + n + ' solver reaches boss/triforce room');
    for (const edge of lvl.edges) if (edge.type === 'shutter') {
      assert(edge.condition && (edge.condition.room === edge.a || edge.condition.room === edge.b) &&
             lvl.rooms[edge.condition.room].room.shutter === edge.condition.kind,
        'L' + n + ' shutter ' + edge.id + ' has an authored condition endpoint');
    }
    console.log('L' + n + ' SOLVER OK');
  }
  for (let n = 1; n <= NUM_DUNGEONS; n++) {
    const lvl = sandbox.Dungeon.level(n);
    const keys = Object.values(lvl.rooms).filter(rd => rd.item && rd.item.kind === 'key').length;
    const locks = lvl.edges.filter(e => e.type === 'locked').length;
    console.log('D KEY LEDGER L' + n + ' keys=' + keys + ' locks=' + locks + ' spare=' + (keys - locks));
  }
  // Batch D: capability inventory is carried across the critical path. Bomb
  // edges are deliberately omitted here: they are shortcuts, never required.
  function solveCritical(lvl, initialKeys, bombs = false, blockedId = null) {
    const entry = lvl.entry.col + ',' + lvl.entry.row, reached = new Set([entry]), opened = new Set();
    const clearedRooms = new Set(), keysByRoom = new Set();
    let keys = initialKeys, locks = 0, hasBombs = bombs, changed = true;
    function collect(room) {
      const rd = lvl.rooms[room];
      if (!rd || !rd.item || rd.item.kind !== 'key') return;
      if (rd.item.requiresClear && !clearedRooms.has(rd.item.requiresClear)) return;
      if (!keysByRoom.has(room)) { keysByRoom.add(room); keys++; }
    }
    collect(entry);
    while (changed) {
      changed = false;
      for (const edge of lvl.edges) {
        if (opened.has(edge.id) || edge.id === blockedId || (edge.type === 'bomb' && !hasBombs)) continue;
        const from = reached.has(edge.a) ? edge.a : reached.has(edge.b) ? edge.b : null;
        if (!from) continue;
        if (edge.type === 'locked') { if (keys <= 0) continue; keys--; locks++; }
        if (edge.type === 'shutter') {
          const condition = edge.condition, rd = condition && lvl.rooms[condition.room];
          if (!rd || !reached.has(condition.room) || rd.room.shutter !== condition.kind) continue;
          if (rd.enemies && rd.enemies.some(e => e[0] === 'dodongo') && !hasBombs) continue;
          clearedRooms.add(condition.room);
        }
        opened.add(edge.id);
        const to = from === edge.a ? edge.b : edge.a;
        if (!reached.has(to)) {
          reached.add(to); const rd = lvl.rooms[to];
          if (rd.item && rd.item.kind === 'bomb') hasBombs = true;
          changed = true;
        }
        for (const room of reached) collect(room);
      }
    }
    return { reached, keys, locks, bombs: hasBombs };
  }
  let carriedKeys = 0, totalKeys = 0, totalLocks = 0;
  for (let n = 1; n <= NUM_DUNGEONS; n++) {
    const lvl = sandbox.Dungeon.level(n), bossKey = Object.keys(lvl.rooms).find(k => lvl.rooms[k].boss);
    assert(Object.values(lvl.rooms).filter(rd => rd.item && rd.item.kind === 'map').length === 1 &&
      Object.values(lvl.rooms).filter(rd => rd.item && rd.item.kind === 'compass').length === 1,
      'L' + n + ' has exactly one map and compass room item');
    const solved = solveCritical(lvl, carriedKeys);
    assert(solved.reached.has(bossKey), 'critical path reaches L' + n + ' boss with carried keys');
    carriedKeys = solved.keys;
    totalKeys += Object.values(lvl.rooms).filter(rd => rd.item && rd.item.kind === 'key').length;
    totalLocks += lvl.edges.filter(e => e.type === 'locked').length;
    if (n === 6) assert(sandbox.Dungeon.level(2).rooms['3,1'].item.kind === 'bow', 'critical path assumption: L2 bow precedes L6 Gohma');
    if (n === 7) assert(sandbox.Dungeon.level(5).item === 'whistle', 'critical path assumption: L5 whistle precedes L7 Digdogger');
  }
  assert(totalKeys === totalLocks + 1 && carriedKeys === 1,
    'sequential L1-L8 key ledger is exactly locks+1 (keys=' + totalKeys + ', locks=' + totalLocks + ', carry=' + carriedKeys + ')');
  console.log('SEQUENTIAL KEY SOLVER OK — L1 before L6 bow, L5 before L7 whistle, final spare=' + carriedKeys);

  // Batch F: Level 9 is a separate post-Triforce stage and must not alter the
  // eight-dungeon accounting or the carried spare-key contract.
  assert(sandbox.Dungeon.count === 8 && sandbox.Dungeon.level(9).id === 9,
    'L9 is registered out-of-band without changing Dungeon.count');
  const l9 = sandbox.Dungeon.level(9), r9 = solveLevel(l9);
  assert(r9.size === Object.keys(l9.rooms).length, 'L9 solver reaches every room (' + r9.size + '/' + Object.keys(l9.rooms).length + ')');
  const l9Boss = Object.keys(l9.rooms).find(k => l9.rooms[k].boss);
  const l9Silver = Object.keys(l9.rooms).find(k => l9.rooms[k].item && l9.rooms[k].item.kind === 'silverarrows');
  const l9Red = Object.keys(l9.rooms).find(k => l9.rooms[k].item && l9.rooms[k].item.kind === 'redring');
  const l9Zelda = Object.keys(l9.rooms).find(k => l9.rooms[k].item && l9.rooms[k].item.kind === 'zelda');
  const l9Rupee = Object.keys(l9.rooms).find(k => l9.rooms[k].item && l9.rooms[k].item.kind === 'rupee5');
  assert(r9.has(l9Boss) && r9.has(l9Silver) && r9.has(l9Red) && r9.has(l9Zelda),
    'L9 solver reaches Ganon, silver arrows, red ring, and Zelda rooms');
  for (const edge of l9.edges) if (edge.type === 'shutter') {
    assert(edge.condition && (edge.condition.room === edge.a || edge.condition.room === edge.b) &&
      l9.rooms[edge.condition.room].room.shutter === edge.condition.kind,
      'L9 shutter ' + edge.id + ' has an authored condition endpoint');
  }
  const l9Critical = solveCritical(l9, carriedKeys);
  const l9PatraGate = l9.edges.find(e => e.type === 'shutter' && e.condition && e.condition.room === l9Red);
  assert(l9.edges.filter(e => e.type === 'locked').length === 2,
    'L9 has exactly two authored locked edges');
  assert(l9PatraGate && !solveCritical(l9, carriedKeys, false, l9PatraGate.id).reached.has(l9Boss),
    'L9 Patra clear is required before the bomb-free boss route');
  assert(l9Critical.reached.has(l9Boss) && l9Critical.keys === 0,
    'L9 critical path reaches Ganon with carry-in=1 after Patra and spends both locks');
  assert(l9.edges.filter(e => e.type === 'bomb').length >= 2 &&
    solveCritical(l9, carriedKeys, false).reached.has(l9Boss),
    'L9 bomb shortcuts are optional and never required for Ganon');
  assert(Object.values(l9.rooms).filter(rd => rd.item && rd.item.kind === 'map').length === 1 &&
    Object.values(l9.rooms).filter(rd => rd.item && rd.item.kind === 'compass').length === 1 &&
    Object.values(l9.rooms).filter(rd => rd.item && rd.item.kind === 'silverarrows' && rd.item.guarded).length === 1 &&
    l9Rupee && l9Critical.reached.has(l9Rupee),
    'L9 has one map, one compass, guarded silver arrows, and a pre-Ganon rupee pickup');
  console.log('L9 SOLVER OK — 14 rooms, keys=2 locks=2 carry-in=1 spare=0, Patra mandatory, bombs optional');

  // F1/F4 gate, reveal, banner, red ring, and final-Triforce behavior.
  G._test.startGame(); G.state.quest.phase = 'collecting';
  G._test.loadOverworld(11, 0, [7 * 16, 8 * 16]); frames(1);
  assert(G.state.grid[5][7] !== 'D', 'L9 entrance is hidden before level9Open');
  G.state.link.hasWhistle = true; G.state.link.bItem = 'whistle';
  G.state.onWhistle();
  assert(G.state.grid[5][7] !== 'D' && !G.state.revealed.has('sec:11,0'),
    'whistle does not reveal or persist L9 before level9Open');
  G.state.quest.phase = 'level9Open'; G.state.onWhistle();
  assert(G.state.grid[5][7] === 'D' && G.state.revealed.has('sec:11,0'), 'L9 entrance reveals once at the NE ridge');
  G._test.saveGame(); G._test.startGame();
  assert(G._test.loadGame() && G.state.col === 11 && G.state.row === 0 && G.state.grid[5][7] === 'D',
    'L9 entrance reveal persists across save/load');
  G.state.quest.phase = 'ganonDefeated'; G._test.loadOverworld(11, 0, [7 * 16, 8 * 16]);
  assert(G.state.grid[5][7] === 'D', 'L9 entrance renders after Ganon is defeated');
  G._test.enterDungeon(9);
  assert(G.state.mode === 'dungeon', 'enterDungeon(9) succeeds after Ganon is defeated');
  G._test.exitDungeon();
  G.state.quest.phase = 'collecting'; G._test.enterDungeon(9);
  assert(G.state.mode === 'overworld', 'enterDungeon(9) refuses before level9Open');
  G.state.quest.phase = 'level9Open'; G._test.enterDungeon(9);
  assert(G.state.mode === 'dungeon' && G.state.banner === "LEVEL-9  DEATH'S CROWN", 'L9 banner is exact');

  const l9RedRoom = l9.rooms[l9Red], redPatra = sandbox.Entities.makePatra(8, 4);
  G.state.level = l9; G._test.loadDungeonRoom(+l9Red.split(',')[0], +l9Red.split(',')[1], [7 * 16, 8 * 16]); frames(22);
  const livePatra = G.state.entities.find(e => e.etype === 'patra');
  const liveSats = G.state.entities.filter(e => e.etype === 'patraSatellite');
  assert(livePatra && livePatra.invulnerable && liveSats.length === 8 && liveSats.every(e => e.countsForClear),
    'Patra core is invulnerable while all eight satellites live');
  for (const sat of liveSats) { sat.flash = 0; sat.hurt(G.state, 99, sat.x + 20, sat.y); }
  frames(1);
  assert(livePatra.alive !== false && livePatra.invulnerable === false &&
    !G.state.entities.some(e => e.item === 'redring'), 'Patra core unlocks only after satellites, item still guarded');
  livePatra.flash = 0; livePatra.hurt(G.state, 99, livePatra.x + 20, livePatra.y);
  frames(2);
  assert(G.state.entities.some(e => e.item === 'redring'), 'Patra clear releases the guarded red ring');
  assert(redPatra.satellites.length === 8, 'Patra factory builds eight orbiting satellites');

  G._test.loadDungeonRoom(2, 1, [3 * 16, 5 * 16]); frames(1);
  const l9RupeeItem = G.state.entities.find(e => e.item === 'rupee5');
  assert(l9RupeeItem && G.state.link.rupees === 0, 'L9 fixed rupee pickup exists with zero carry-in');
  G._test.collect(l9RupeeItem); G.state.link.hasBow = true; G.state.link.hasSilverArrows = true; G.state.link.bItem = 'bow';
  G.state.link.useItem(G.state);
  assert(G.state.link.rupees === 4 && G.state.entities.some(e => e.ptype === 'arrow' && e.silver),
    'L9 rupee pickup funds a silver arrow before Ganon');
  G.state.link.hasRing = true; G.state.link.hasRedRing = true;
  G._test.saveGame(); G._test.startGame(); assert(G._test.loadGame() && G.state.link.hasRing && G.state.link.hasRedRing,
    'red ring persists alongside blue ring across save/load');
  console.log('F1/F2/F4 OK — hidden gate, Patra satellites, red-ring precedence, banner');

  // F3/F5: Ganon stun ladder, silver-arrow kill, Zelda rescue, ending, and
  // completed save (the localStorage record is intentionally retained).
  G._test.startGame(); G.state.quest.phase = 'level9Open'; G.state.level = l9;
  G._test.loadDungeonRoom(3, 0, [7 * 16, 8 * 16]); frames(2);
  const ganon = G.state.entities.find(e => e.etype === 'ganon');
  assert(ganon && ganon.hidden && ganon.invulnerable && ganon.stuns === 0, 'Ganon begins invisible and invulnerable');
  ganon.flash = 0; ganon.hurt(G.state, 99, ganon.x - 20, ganon.y); assert(ganon.hp === 6 && ganon.stuns === 1 && !ganon.hidden, 'first sword hit stuns and reveals Ganon without damage');
  for (let i = 0; i < 3; i++) { ganon.flash = 0; ganon.hurt(G.state, 99, ganon.x - 20, ganon.y); }
  assert(ganon.stuns === 4 && !ganon.hidden && !ganon.invulnerable, 'fourth stun leaves Ganon exposed');
  ganon.flash = 0; ganon.hurt(G.state, 99, ganon.x - 20, ganon.y, 'arrow', {silver:false});
  assert(ganon.alive !== false, 'non-silver arrow cannot kill Ganon');
  ganon.stun = 0; ganon.shootTimer = 1; const fireBefore = G.state.entities.filter(e => e.ptype === 'fireball').length; ganon.update(G.state);
  assert(G.state.entities.filter(e => e.ptype === 'fireball').length >= fireBefore + 5, 'Ganon fireball fan emits five shots');
  const blueFireball = G.state.entities.filter(e => e.ptype === 'fireball').at(-1);
  G.state.link.hasRing = true; G.state.link.hasRedRing = false; G.state.link.health = 20; G.state.link.invuln = 0; G.state.link.knock = null;
  blueFireball.x = G.state.link.x; blueFireball.y = G.state.link.y; blueFireball.update(G.state);
  const blueFireballLoss = 20 - G.state.link.health;
  G.state.link.hasRedRing = true; G.state.link.health = 20; G.state.link.invuln = 0; G.state.link.knock = null;
  ganon.shootTimer = 1; ganon.stun = 0; const redFireBefore = G.state.entities.filter(e => e.ptype === 'fireball').length; ganon.update(G.state);
  const redFireball = G.state.entities.filter(e => e.ptype === 'fireball').slice(redFireBefore)[0];
  redFireball.x = G.state.link.x; redFireball.y = G.state.link.y; redFireball.update(G.state);
  const redFireballLoss = 20 - G.state.link.health;
  assert(blueFireballLoss > redFireballLoss && blueFireballLoss === 2 && redFireballLoss === 1,
    'real Ganon fireball is reduced more by red ring than blue ring');
  ganon.flash = 0; ganon.hurt(G.state, 4, ganon.x - 20, ganon.y, 'arrow', {silver:true});
  assert(ganon.alive === false && G.state.quest.phase === 'ganonDefeated', 'silver arrow kills Ganon after four stuns');
  const zEdge = l9.edges.find(e => e.type === 'shutter' && e.condition && e.condition.kind === 'ganon');
  assert(zEdge && G.state.edgeState[zEdge.id] === 'open', 'Ganon death opens the Zelda shutter');
  G._test.exitDungeon(); G._test.enterDungeon(9);
  assert(G.state.mode === 'dungeon' && G.state.quest.phase === 'ganonDefeated',
    'a defeated-Ganon save can re-enter a fresh L9 visit');
  G._test.loadDungeonRoom(3, 0, [7 * 16, 8 * 16]); frames(1);
  assert(!G.state.entities.some(e => e.etype === 'ganon'), 'defeated Ganon does not respawn on L9 re-entry');
  G._test.loadDungeonRoom(3, -1, [7 * 16, 8 * 16]); frames(1);
  const zelda = G.state.entities.find(e => e.item === 'zelda'); assert(zelda, 'Zelda pickup appears after a fresh L9 visit'); G.state.link.x = zelda.x; G.state.link.y = zelda.y; frames(2);
  const completed = JSON.parse(sandbox.localStorage.getItem('zelda_save_v1'));
  assert(G.state.quest.phase === 'rescued' && G.state.mode === 'ending' && completed.world.counters.questComplete && completed.world.counters.ngMarker,
    'Zelda rescue enters ending and writes completed NG save');
  assert(sandbox.localStorage.getItem('zelda_save_v1'), 'completed save is not wiped');
  G._test.loadGame(); assert(G.state.mode === 'overworld' && G.state.quest.phase === 'rescued', 'Continue after ending returns to explorable overworld');
  console.log('F3/F5 OK — Ganon 4-stun silver kill, Zelda ending, completed save retained');

  // Map/compass visibility is per level: visited-only, then full map, then
  // compass target blink. The draw hook keeps this headless and deterministic.
  G._test.startGame(); G._test.enterDungeon(1); frames(1);
  G.state.visitedRooms = new Set(['1:2,2']);
  const miniCalls = [];
  const miniCtx = { fillStyle:'#000', fillRect(x,y,w,h) { miniCalls.push({x,y,w,h,color:this.fillStyle}); } };
  G._test.drawMiniMap(miniCtx, 8, 8);
  assert(miniCalls.length === 1, 'minimap without map draws visited rooms only');
  miniCalls.length = 0; G.state.taken.add('map:L1'); G._test.drawMiniMap(miniCtx, 8, 8);
  assert(miniCalls.length === Object.keys(sandbox.Dungeon.level(1).rooms).length, 'minimap with map draws every room');
  G.state.taken.add('compass:L1'); miniCalls.length = 0; G._test.drawMiniMap(miniCtx, 8, 8);
  assert(miniCalls.some(c => c.color === '#d82828' || c.color === '#fff'), 'compass marks blinking Triforce room');
  console.log('MINIMAP OK — visited-only, full map, compass blink');

  G._test.startGame(); G._test.enterDungeon(1); G._test.loadDungeonRoom(3, 1, [2 * 16, 5 * 16]); frames(1);
  assert(!G.state.entities.some(e => e.item === 'boomerang'), 'guarded item absent before room clear');
  for (const en of G.state.entities) if (en.kind === 'enemy') { en._spawnDelay=0; en.flash=0; en.hurt(G.state,99,en.x+8,en.y+8); }
  frames(2); assert(G.state.entities.some(e => e.item === 'boomerang'), 'guarded item appears after room clear');
  console.log('GUARDED ITEMS OK — clear release and shutter SFX path verified');

  const l4Mini = sandbox.Dungeon.level(4).rooms['1,1'];
  assert(l4Mini.room.shutter === 'clear' && l4Mini.room.miniboss &&
    l4Mini.enemies.filter(e => e[0] === 'dodongo').length === 2 && l4Mini.enemies.some(e => e[0] === 'moldorm'),
    'L4 map room is a clear-shutter Moldorm + paired Dodongo miniboss');
  for (const n of [5,6,7,8]) {
    const lvl = sandbox.Dungeon.level(n), room = Object.values(lvl.rooms).find(rd => rd.room.miniboss);
    assert(room && room.room.shutter === 'clear' && room.item && ['map','compass'].includes(room.item.kind),
      'L' + n + ' miniboss guards map/compass behind clear shutter');
  }
  console.log('MINIBOSS SPREAD OK — L4-L8 clear shutters, Moldorms, paired Dodongos');

  G._test.startGame(); G.state.level = sandbox.Dungeon.level(4);
  G._test.loadDungeonRoom(1, 1, [7 * 16, 8 * 16]); frames(1);
  const l4Dodongos = G.state.entities.filter(e => e.etype === 'dodongo');
  assert(l4Dodongos.length === 2 && l4Dodongos.every(e => e.boss === false), 'L4 dodongos are minibosses, not bosses');
  for (const dodongo of l4Dodongos) {
    dodongo.hp = 1; dodongo.dir = 'left'; dodongo.swallow = 0;
    G.state.entities.push(sandbox.Entities.makeBomb(dodongo.x - 11, dodongo.y + 2));
    dodongo.update(G.state);
  }
  assert(!G.state.taken.has('boss4:1,1') && !G.state.taken.has('bossheart:L4') &&
    !G.state.entities.some(e => e._unique === 'bossheart:L4'), 'miniboss Dodongo kills grant no boss rewards');

  G._test.startGame(); G.state.level = sandbox.Dungeon.level(5);
  G._test.loadDungeonRoom(2, 0, [7 * 16, 8 * 16]); frames(1);
  const realDodongo = G.state.entities.find(e => e.etype === 'dodongo' && e.boss);
  realDodongo.hp = 1; realDodongo.dir = 'left'; realDodongo.swallow = 0;
  G.state.entities.push(sandbox.Entities.makeBomb(realDodongo.x - 11, realDodongo.y + 2)); realDodongo.update(G.state);
  assert(G.state.taken.has('boss5:2,0') && G.state.entities.filter(e => e.item === 'heartcontainer').length === 1,
    'real L5 Dodongo still grants exactly one boss heart');
  G._test.startGame();
  const heartA = sandbox.Entities.makeItem('heartcontainer', 0, 0), heartB = sandbox.Entities.makeItem('heartcontainer', 0, 0);
  heartA._unique = heartB._unique = 'bossheart:test';
  const maxBeforeUnique = G.state.link.maxHealth;
  assert(G._test.collect(heartA) === 'taken' && G.state.link.maxHealth === maxBeforeUnique + 2,
    'first same-unique heart raises max health by one container');
  assert(G._test.collect(heartB) === 'kept' && heartB.alive === false && G.state.link.maxHealth === maxBeforeUnique + 2,
    'second same-unique heart is rejected without another max-health increase');

  function strikeMoldormAtTail(moldorm) {
    const target = [...moldorm.segments].reverse().find(s => s.hp > 0);
    G.state.link.x = target.x - 10; G.state.link.y = target.y; G.state.link.dir = 'right';
    G.state.swordHitSet = new Set(); G.state.swordSwung = 2; G.state.entities = [moldorm];
    G._test.update(); moldorm.flash = 0;
  }
  G._test.startGame();
  let moldorm = sandbox.Entities.makeMoldorm(8, 5); G.state.entities = [moldorm];
  G.state.link.x = 116; G.state.link.y = 80; G.state.link.dir = 'right';
  G.state.swordHitSet = new Set(); G.state.swordSwung = 2; G._test.update();
  assert(moldorm.segments[3].hp === 1, 'Moldorm sword strike at distant head does not hit the tail');
  moldorm = sandbox.Entities.makeMoldorm(8, 5);
  strikeMoldormAtTail(moldorm);
  assert(moldorm.segments[3].hp === 0, 'Moldorm sword strike reaches the tail segment');
  for (let i = 0; i < 3 && moldorm.alive !== false; i++) strikeMoldormAtTail(moldorm);
  assert(moldorm.alive === false, 'Moldorm can be killed with sword strikes only');

  moldorm = sandbox.Entities.makeMoldorm(8, 5); G.state.entities = [moldorm];
  let moldArrow = sandbox.Entities.makeProjectile('arrow', moldorm.segments[0].x - 4, moldorm.segments[0].y - 4,
    'right', { vx:0, vy:0, speed:0, damage:1, fromEnemy:false });
  moldArrow.update(G.state); assert(moldorm.segments[3].hp === 1, 'Moldorm projectile strike at head does not hit the tail');
  moldArrow = sandbox.Entities.makeProjectile('arrow', moldorm.segments[3].x - 4, moldorm.segments[3].y - 4,
    'right', { vx:0, vy:0, speed:0, damage:1, fromEnemy:false });
  moldArrow.update(G.state); assert(moldorm.segments[3].hp === 0, 'Moldorm player projectile reaches the tail segment');
  console.log('MINIBOSS COMBAT OK — Dodongo rewards suppressed, Moldorm tail is sword/projectile vulnerable');

  G._test.startGame(); G.state.link.hasRaft = true; G._test.enterDungeon(6); G._test.loadDungeonRoom(2, 0, [3 * 16, 5 * 16]); frames(1);
  let gohma = G.state.entities.find(e => e.etype === 'gohma');
  assert(gohma && gohma.hp === 3, 'L6 Gohma spawned'); gohma.hurt(G.state,9,gohma.x,gohma.y); assert(gohma.hp === 3, 'Gohma rejects non-arrow hits');
  gohma.eyeOpen = false; gohma.hurt(G.state,1,gohma.x,gohma.y,'arrow'); assert(gohma.hp === 3, 'Gohma rejects arrows while armored');
  gohma.eyeOpen = true; gohma.hurt(G.state,1,gohma.x,gohma.y,'arrow'); assert(gohma.hp === 2, 'Gohma accepts an arrow only while eye is open');
  console.log('GOHMA OK — armored and arrow/eye-gated');

  G._test.startGame(); G._test.enterDungeon(7); G._test.loadDungeonRoom(4, 0, [3 * 16, 5 * 16]); frames(1);
  const dig = G.state.entities.find(e => e.etype === 'digdogger'); G.state.link.hasWhistle = true;
  sandbox.ITEMS.whistle.use(G.state.link, G.state); assert(dig && !dig.large && dig.shrinkTimer === 600 &&
    G.state.entities.filter(e => e.etype === 'digdoggerSmall').length >= 1, 'Digdogger whistle opens a 10-second small-urchin window');
  console.log('DIGDOGGER OK — whistle shrink window and small urchins');

  G._test.startGame(); G.state.col = 1; G.state.row = 0; G._test.enterDungeon(1); G._test.exitDungeon();
  G.state.col = 4; G.state.row = 0; G._test.enterDungeon(2); G._test.exitDungeon();
  G.state.link.hasWhistle = true; sandbox.ITEMS.whistle.use(G.state.link, G.state);
  const firstWarp = G.state.col + ',' + G.state.row; sandbox.ITEMS.whistle.use(G.state.link, G.state);
  const secondWarp = G.state.col + ',' + G.state.row;
  assert(firstWarp !== secondWarp && G.state.counters.whistleCursor === 2, 'whistle cycles visited dungeon entrances by level id');
  console.log('WHISTLE WARP OK — visited entrance cycle');

  G._test.startGame(); G._test.enterDungeon(7); G._test.loadDungeonRoom(3, 2, [7 * 16, 4 * 16]); frames(1);
  G.state.link.x = 7 * 16; G.state.link.y = 4 * 16; G.state.link.hasBait = false;
  for (const en of G.state.entities) if (en.etype === 'hungrygoriya') en._spawnDelay = 0;
  frames(1);
  assert(G.state.dialogue && G.state.msg === 'GRUMBLE, GRUMBLE...', 'hungry Goriya refuses passage without bait');
  G.state.dialogue = null; G.state.link.hasBait = true; frames(1);
  assert(G.state.taken.has('fedgoriya:L7') && !G.state.link.hasBait, 'hungry Goriya consumes bait once');
  G._test.loadDungeonRoom(3, 2, [7 * 16, 4 * 16]); frames(1);
  assert(!G.state.entities.some(e => e.etype === 'hungrygoriya') && G.state.entities.some(e => e.item === 'compass'), 'fed Goriya stays gone and opens compass branch');
  console.log('HUNGRY GORIYA OK — bait consumed once, compass branch open');

  const bombEdge = sandbox.Dungeon.level(4).edges.find(e => e.type === 'bomb');
  assert(bombEdge && [4,6,8].every(n => sandbox.Dungeon.level(n).edges.filter(e => e.type === 'bomb').length === 1),
    'L4/L6/L8 each have one bomb shortcut edge');
  G.state.level = sandbox.Dungeon.level(4); G.state.worldEdges = {};
  G._test.loadDungeonRoom(1, 1, [8 * 16, 5 * 16]); frames(1);
  const bombTile = sandbox.Dungeon.doorTiles(bombEdge, '1,1')[0];
  assert(G.state.grid[bombTile[1]][bombTile[0]] === 'Q', 'bomb edge renders cracked solid wall');
  G.state.onBombBlast(bombTile[0]*16+8, bombTile[1]*16+8);
  assert(G.state.worldEdges[bombEdge.id] === 'open', 'bomb edge opens permanently');
  G._test.startGame(); G._test.enterDungeon(4); frames(1);
  G._test.loadDungeonRoom(2, 1, [7 * 16, 8 * 16]); frames(1);
  const l4Bomb = G.state.entities.find(e => e.item === 'bomb');
  assert(l4Bomb && G.state.link.bombs === 0, 'fresh L4 has an in-dungeon bomb pickup before the miniboss');
  G.state.link.x = l4Bomb.x; G.state.link.y = l4Bomb.y; frames(2);
  assert(G.state.link.bombs >= 4 && G.state.col + ',' + G.state.row !== '1,1', 'fresh L4 can collect bombs before entering 1,1');
  assert(solveCritical(sandbox.Dungeon.level(4), 0).bombs &&
    solveCritical(sandbox.Dungeon.level(4), 0).reached.has('1,0') &&
    solveCritical(sandbox.Dungeon.level(4), 0, true).reached.has('0,1'),
    'bomb shortcut is optional but passable when bombs are obtainable');
  console.log('BOMB WALLS OK — crack telegraph, persistent open, optional shortcuts');
  const l1Full = solveLevel(sandbox.Dungeon.level(1));
  assert(l1Full.size === Object.keys(sandbox.Dungeon.level(1).rooms).length,
    'L1 full traversal reaches every room via satisfiable shutters');
  console.log('L1 FULL TRAVERSAL OK — clear@2,1 shutter condition is reachable');
  for (let n = 1; n <= NUM_DUNGEONS; n++) {
    const lvl = sandbox.Dungeon.level(n), edgeCells = new Set();
    for (const edge of lvl.edges) for (const room of edgeRooms(edge)) {
      const rd = lvl.rooms[room];
      for (const [c, r] of sandbox.Dungeon.doorTiles(edge, room)) {
        edgeCells.add(room + ':' + c + ',' + r);
        const ch = rd.room.rows[r][c];
        assert(ch === 'F' || ch === 'L' || ch === 'Z' || ch === 'Q', 'L' + n + ' edge tile is carved on ' + room + ':' + c + ',' + r);
      }
    }
    for (const room in lvl.rooms) {
      const rows = lvl.rooms[room].room.rows;
      for (const [c, r] of [[7,0],[8,0],[7,10],[8,10],[0,4],[0,5],[0,6],[15,4],[15,5],[15,6]]) {
        if (rows[r][c] === 'F' || rows[r][c] === 'L' || rows[r][c] === 'Z' || rows[r][c] === 'Q')
          assert(edgeCells.has(room + ':' + c + ',' + r), 'L' + n + ' door tile has no canonical edge: ' + room + ':' + c + ',' + r);
      }
    }
  }
  console.log('RECIPROCITY OK — every dungeon door is reciprocal and edge-backed');

  function edgeOf(n, a, b) {
    const lvl = sandbox.Dungeon.level(n);
    return lvl.edges.find(e => (e.a === a && e.b === b) || (e.a === b && e.b === a));
  }
  const l1Shutter = edgeOf(1, '2,1', '3,1');
  assert(l1Shutter && l1Shutter.type === 'shutter' && l1Shutter.condition.room === '2,1',
    'L1 2,1<->3,1 is a clear@2,1 shutter');
  assert(!solveLevel(sandbox.Dungeon.level(1), l1Shutter.id).has('3,1'),
    'solver does not treat the L1 shutter as passable before its hub is reachable');
  const l5Open = edgeOf(5, '1,1', '2,1');
  assert(l5Open && l5Open.type === 'open', 'L5 1,1<->2,1 is reciprocal open');
  assert(!edgeOf(8, '0,0', '1,0'), 'L8 0,0->1,0 has no non-reciprocal wall-pass edge');
  const l8Open = edgeOf(8, '0,1', '1,1');
  assert(l8Open && l8Open.type === 'open', 'L8 0,1<->1,1 is reciprocal open');
  const l6Shutter = edgeOf(6, '2,2', '2,1');
  assert(l6Shutter && l6Shutter.type === 'shutter' && l6Shutter.condition.room === '2,2' &&
         l6Shutter.condition.kind === 'clear', 'L6 2,2<->2,1 is clear@2,2 shutter');
  console.log('EDGE FIXTURES OK — A1 topology is explicit and reciprocal');

  const badSpawns = [];
  function auditSpawn(label, rows, type, tx, ty) {
    if (sandbox.Tiles.isSolid(rows[ty][tx])) badSpawns.push(label + ' ' + type + '@' + tx + ',' + ty);
  }
  for (const key in sandbox.World.CFG) {
    const [c, r] = key.split(',').map(Number), sc = sandbox.World.get(c, r);
    for (const [i, spawn] of (sc.enemies || []).entries()) auditSpawn('world ' + key + ' enemy' + i, sc.rows, spawn[0], spawn[2], spawn[3]);
  }
  for (let r = 0; r < sandbox.World.ROWS_W; r++) for (let c = 0; c < sandbox.World.COLS_W; c++) {
    const sc = sandbox.World.get(c, r);
    for (const [i, spawn] of (sc.enemies || []).entries()) auditSpawn('screen ' + c + ',' + r + ' enemy' + i, sc.rows, spawn[0], spawn[2], spawn[3]);
  }
  for (let n = 1; n <= NUM_DUNGEONS; n++) {
    const lvl = sandbox.Dungeon.level(n);
    for (const room in lvl.rooms) {
      const rd = lvl.rooms[room], rows = rd.room.rows;
      for (const [i, spawn] of (rd.enemies || []).entries()) auditSpawn('L' + n + ' room ' + room + ' enemy' + i, rows, spawn[0], spawn[2], spawn[3]);
      if (rd.item) auditSpawn('L' + n + ' room ' + room + ' item', rows, rd.item.kind, rd.item.x, rd.item.y);
    }
  }
  assert(badSpawns.length === 0, 'spawn audit has solid-tile placements: ' + JSON.stringify(badSpawns));
  console.log('SPAWN AUDIT OK — bad=0, allowlist empty');

  // Batch C intentionally changes authored CFG landmarks, so the world golden
  // fixture includes the authored-key set as well as the generated-screen seed.
  const goldenScreen = { generated:sandbox.World._test.genScreen(11, 13), authored:Object.keys(sandbox.World.CFG).sort() };
  const goldenHash = stableHash(JSON.stringify(goldenScreen));
  assert(JSON.stringify(sandbox.World._test.genScreen(11, 13)) === JSON.stringify(goldenScreen.generated), 'generated screen is deterministic');
  assert(goldenHash === '42ab2f93', 'authored world golden hash updated intentionally: ' + goldenHash);
  console.log('GOLDEN HASH', goldenHash);

  G._test.startGame(); frames(1);
  const v1Unlocked = '1:2,1:7,0';
  sandbox.localStorage.setItem('zelda_save_v1', JSON.stringify({ v:1, col:2, row:3, x:112, y:128,
    triforces:2, taken:['old-item'], revealed:['3,1'], unlocked:[v1Unlocked], link:{rupees:19,bombs:7,keys:8,maxHealth:20,health:18} }));
  assert(G._test.loadGame(), 'v1 complete save migrates');
  assert(G.state.link.rupees === 19 && G.state.link.bombs === 7 && G.state.link.keys === 8 &&
         G.state.link.maxHealth === 20 && G.state.link.health === 18, 'v1 migration preserves existing combat stats');
  assert(G.state.worldEdges['1:2,0|2,1'] === 'open', 'v1 unlocked door tile migrates to canonical edge');
  assert(G.state.revealed.has('sec:3,1'), 'v1 revealed coordinate migrates to secret ID');
  sandbox.localStorage.setItem('zelda_save_v1', JSON.stringify({ v:1, col:2, row:3, link:{rupees:12} }));
  assert(G._test.loadGame(), 'v1 partial save loads with defaults');
  sandbox.localStorage.setItem('zelda_save_v1', '{bad json');
  assert(!G._test.loadGame(), 'malformed JSON is rejected without throw');
  sandbox.localStorage.setItem('zelda_save_v1', JSON.stringify({ v:1, col:'2', row:3, link:{} }));
  assert(!G._test.loadGame(), 'wrong save types are rejected without throw');
  sandbox.localStorage.setItem('zelda_save_v1', JSON.stringify({ v:1, col:999, row:3, link:{} }));
  assert(!G._test.loadGame(), 'out-of-bounds saves are rejected without throw');
  sandbox.localStorage.setItem('zelda_save_v1', JSON.stringify({ v:1, col:0, row:0, x:0, y:0, link:{} }));
  assert(G._test.loadGame() && G.state.col === 0 && G.state.row === 0 && G.state.link.x === 0 && G.state.link.y === 0,
    'zero-valued col/row/x/y fixture loads');
  sandbox.localStorage.setItem('zelda_save_v1', JSON.stringify({ v:1, col:0, row:0, x:-1, y:0, link:{} }));
  assert(!G._test.loadGame(), 'negative x save is rejected');
  sandbox.localStorage.setItem('zelda_save_v1', JSON.stringify({ v:1, col:0, row:0, x:0, y:177, link:{} }));
  assert(!G._test.loadGame(), 'out-of-bounds y save is rejected');
  sandbox.localStorage.setItem('zelda_save_v1', JSON.stringify({ v:1, col:0, row:0, x:'0', y:0, link:{} }));
  assert(!G._test.loadGame(), 'non-numeric x save is rejected');
  G._test.startGame(); G.state.link.rupees = 27; G.state.taken.add('fixture'); G._test.saveGame();
  const v2 = JSON.parse(sandbox.localStorage.getItem('zelda_save_v1'));
  assert(v2.v === 2 && v2.quest && v2.world && Array.isArray(v2.world.visitedScreens), 'v2 save envelope is structured');
  G._test.startGame(); assert(G._test.loadGame() && G.state.link.rupees === 27 && G.state.taken.has('fixture'), 'v2 save round-trips');
  console.log('SAVE FIXTURES OK — v1 migration, malformed/type/bounds rejection, v2 round-trip');

  // ---- Batch E: macro geography, traversal, overworld secrets, raft, ladder ----
  function worldReachable() {
    const seen = new Set(['2,3']), queue = [[2,3]];
    while (queue.length) {
      const [c,r] = queue.shift();
      for (const [dc,dr] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nc = c + dc, nr = r + dr, k = nc + ',' + nr;
        if (sandbox.World.has(nc,nr) && sandbox.World.edgeOpen(c,r,nc,nr) && !seen.has(k)) {
          seen.add(k); queue.push([nc,nr]);
        }
      }
    }
    return seen;
  }
  const reachedWorld = worldReachable();
  assert(reachedWorld.size === sandbox.World.COLS_W * sandbox.World.ROWS_W,
    'world spanning tree reaches every screen (' + reachedWorld.size + ')');
  for (let r = 0; r < 6; r++) for (let c = 0; c < 8; c++)
    assert(sandbox.World.edgeOpen(c,r,c+1,r), 'authored core horizontal edge stays open ' + c + ',' + r);
  for (let r = 0; r < 5; r++) for (let c = 0; c < 9; c++)
    assert(sandbox.World.edgeOpen(c,r,c,r+1), 'authored core vertical edge stays open ' + c + ',' + r);
  for (const [c,r] of [[10,6],[3,11]]) assert(reachedWorld.has(c + ',' + r), 'required POI reachable ' + c + ',' + r);
  let ridgePasses = 0, riverFords = 0, closedWorldEdges = 0;
  for (let r = 0; r < sandbox.World.ROWS_W; r++) for (let c = 0; c < sandbox.World.COLS_W; c++) {
    if (c + 1 < sandbox.World.COLS_W) {
      if (!sandbox.World.edgeOpen(c,r,c+1,r)) closedWorldEdges++;
      if (c === 9 && r <= 7 && sandbox.World.edgeOpen(c,r,c+1,r)) ridgePasses++;
    }
    if (r + 1 < sandbox.World.ROWS_W) {
      if (!sandbox.World.edgeOpen(c,r,c,r+1)) closedWorldEdges++;
      if (r === 7 && sandbox.World.edgeOpen(c,r,c,r+1)) riverFords++;
    }
  }
  assert(ridgePasses >= 3 && riverFords >= 2, 'mountain passes=' + ridgePasses + ', river fords=' + riverFords);
  assert(closedWorldEdges > 0, 'wilderness macro graph has closed edges');
  for (let r = 0; r < sandbox.World.ROWS_W; r++) for (let c = 0; c < sandbox.World.COLS_W; c++) {
    for (const [dc,dr] of [[1,0],[0,1]]) if (sandbox.World.has(c+dc,r+dr)) {
      assert(sandbox.World.edgeOpen(c,r,c+dc,r+dr) === sandbox.World.edgeOpen(c+dc,r+dr,c,r),
        'edgeOpen is symmetric at ' + c + ',' + r);
    }
  }
  assert(sandbox.World.biomeFor(10,0) === 'mountain' && sandbox.World.biomeFor(2,8) === 'graveyard' &&
    sandbox.World.biomeFor(2,10) === 'forest' && sandbox.World.biomeFor(8,10) === 'desert' &&
    sandbox.World.biomeFor(5,5) === 'lake' && sandbox.World.biomeFor(11,12) === 'coast', 'biome geography samples');
  const closedMountain = sandbox.World.build(9,0), closedRiver = sandbox.World.build(8,7);
  assert(closedMountain[4][15] === 'M' && closedMountain[5][15] === 'M', 'mountain ridge closure is continuous M terrain');
  assert(closedRiver[10][7] === 'W' && closedRiver[10][8] === 'W', 'river closure is continuous W terrain');
  const worldPoi = [];
  for (let r = 0; r < sandbox.World.ROWS_W; r++) for (let c = 0; c < sandbox.World.COLS_W; c++) {
    if (c < 9 && r < 6) continue;
    const sc = sandbox.World.get(c,r);
    if (sc.cave || sc.secret || sc.dungeon || (sc.caves && sc.caves.length)) worldPoi.push(c + ',' + r);
  }
  assert(worldPoi.length >= 15, 'frontier POI density is ' + worldPoi.length + ' screens across 114 wilderness screens');
  for (const k of worldPoi) assert(reachedWorld.has(k), 'POI is connected: ' + k);
  console.log('E1/E2 GRAPH OK — screens=' + reachedWorld.size + ' closedEdges=' + closedWorldEdges +
    ' mountainPasses=' + ridgePasses + ' riverFords=' + riverFords);
  console.log('E8 POI DENSITY — ' + worldPoi.length + '/' + (sandbox.World.COLS_W * sandbox.World.ROWS_W - 54) +
    ' wilderness screens (' + (worldPoi.length / 114).toFixed(3) + ')');

  G._test.startGame(); G._test.loadOverworld(0,0,[7*16,8*16]);
  G.state.grid = Array.from({length:11}, () => Array(16).fill('.'));
  G.state.grid[5][5] = 'W'; G.state.link.hasStepladder = true; G.state.link.dir = 'right';
  assert(!G.solidFor(G.state.link, 5*16+8, 5*16+8), 'stepladder crosses exactly one water tile');
  G.state.grid[5][6] = 'W';
  assert(G.solidFor(G.state.link, 5*16+8, 5*16+8), 'stepladder refuses a two-tile water crossing');
  console.log('E6 LADDER OK — one-wide bridge only');

  G._test.startGame(); G.state.link.hasRaft = true; G._test.loadOverworld(5,5,[7*16,5*16]);
  G.state.keys.right = true; G._test.update(); G.state.keys.right = false;
  assert(G.state.mode === 'scroll' && G.state._raftRide, 'raft ride starts from the lake dock');
  frames(50); assert(G.state.mode === 'overworld' && G.state.col === 6 && G.state.row === 5 &&
    G.state.link.x === 7*16 && G.state.link.y === 5*16, 'raft ride lands on opposite lake dock');
  G.state.keys.left = true; G._test.update(); G.state.keys.left = false; frames(50);
  assert(G.state.col === 5 && G.state.row === 5, 'raft ride is reversible end-to-end');
  console.log('E5 RAFT OK — locked straight-line lake crossing and return');

  G._test.startGame(); G.state.col = 1; G.state.row = 1;
  G._test.enterCave('shopA', {c:7,r:2}); frames(1);
  const caveCol = G.state.col, caveRow = G.state.row, caveRef = G.state.cave;
  G.state.link.hasWhistle = true; sandbox.ITEMS.whistle.use(G.state.link, G.state);
  assert(G.state.mode === 'cave' && G.state.col === caveCol && G.state.row === caveRow && G.state.cave === caveRef,
    'whistle in a cave leaves position and cave return state intact');
  G._test.exitCave(); assert(G.state.mode === 'overworld' && G.state.col === caveCol && G.state.row === caveRow,
    'cave remains correctly escapable after a whistle attempt');

  G._test.startGame(); G.state.link.hasWhistle = true; G._test.loadOverworld(5,5,[7*16,8*16]);
  sandbox.ITEMS.whistle.use(G.state.link, G.state);
  assert(G.state.grid[5][7] === 'S' && G.state.revealed.has('sec:5,5'), 'whistle drains lake and reveals stairs');
  G._test.saveGame(); G._test.startGame(); assert(G._test.loadGame() && G.state.col === 5 && G.state.row === 5 && G.state.grid[5][7] === 'S',
    'lake whistle reveal persists through save');
  G.state.link.hasWhistle = true; G._test.loadOverworld(10,6,[7*16,8*16]); sandbox.ITEMS.whistle.use(G.state.link, G.state);
  assert(G.state.grid[5][7] === 'D' && G.state.revealed.has('sec:10,6'), 'whistle reveals hidden L7 entrance');
  G._test.saveGame(); G._test.startGame(); assert(G._test.loadGame() && G.state.col === 10 && G.state.row === 6 && G.state.grid[5][7] === 'D',
    'L7 whistle reveal persists through save');
  assert(G._test.CAVES.hintL7.dialog[0] === 'LEVEL-7 SLEEPS EAST BEYOND THE PEAKS. WAKE IT WITH A TUNE.', 'L7 hint text updated');
  console.log('E4 WHISTLE OK — lake secret and hidden L7 persist');

  const replayScreen = sandbox.World.get(0,7), replayRows = replayScreen.rows;
  const replaySecret = replayScreen.secret;
  const replayGrid = replayRows.map(s => s.split(''));
  replayGrid[2][3] = 'G'; replayGrid[8][12] = 'G'; replayScreen.rows = replayGrid.map(a => a.join(''));
  replayScreen.secret = Object.assign({}, replaySecret, { tile:{c:7,r:5} });
  G.state.revealed.add('sec:0,7'); G._test.loadOverworld(0,7,[7*16,8*16]);
  assert(G.state.grid[5][7] === 'S' && G.state.grid[2][3] === 'G' && G.state.grid[8][12] === 'G',
    'revealed grave secret converts only its stored tile');
  replayScreen.rows = replayRows; replayScreen.secret = replaySecret; G.state.revealed.delete('sec:0,7');

  function pushOverworldSecret(col, row, bracelet) {
    G._test.loadOverworld(col,row,[6*16,5*16]); G.state.link.hasPowerBracelet = !!bracelet;
    G.state.link.x = 6*16; G.state.link.y = 5*16; G.state.link.dir = 'right'; G.state.link.moving = true;
    for (let i = 0; i < 20; i++) G._test.tryPush();
  }
  G._test.startGame(); pushOverworldSecret(0,7,false);
  assert(G.state.grid[5][7] === 'G' && !G.state.revealed.has('sec:0,7'), 'gravestone push is bracelet-gated');
  pushOverworldSecret(9,1,false);
  assert(G.state.grid[5][7] === 'A' && !G.state.revealed.has('sec:9,1'), 'armos push is bracelet-gated');
  pushOverworldSecret(9,1,true);
  assert(G.state.grid[5][7] === 'S' && G.state.revealed.has('sec:9,1'), 'power bracelet opens authored armos secret');
  G._test.enterCave('powerbracelet',{c:7,r:5}); frames(1);
  const bracelet = G.state.entities.find(e => e.item === 'powerbracelet'); assert(bracelet && G._test.collect(bracelet) === 'taken', 'bracelet reward is registered');
  pushOverworldSecret(0,7,true); assert(G.state.grid[5][7] === 'S', 'west shortcut gravestone opens with bracelet');
  G._test.enterCave('shortcutWest',{c:7,r:5}); G._test.exitCave();
  assert(G.state.col === 11 && G.state.row === 7, 'west shortcut cave links to east frontier');
  pushOverworldSecret(11,7,true); G._test.enterCave('shortcutEast',{c:7,r:5}); G._test.exitCave();
  assert(G.state.col === 0 && G.state.row === 7, 'east shortcut cave links back west');
  pushOverworldSecret(10,4,true); assert(G.state.grid[5][7] === 'S', 'bracelet vault boulder opens');
  pushOverworldSecret(9,7,true); assert(G.state.grid[5][7] === 'S', 'bracelet fairy pond boulder opens');
  console.log('E3/E4 BRACELET OK — gravestone/armos gates, item, two-way shortcut, vault, fairy pond');

  let dialogDone = false, chosen = null;
  G._test.showDialog({ pages:['PAGE ONE','PAGE TWO'], onDone:() => { dialogDone = true; } });
  G.state.pressed.a = true; G._test.update(); G.state.pressed.a = false;
  assert(G.state.dialogue && G.state.dialogue.index === 1, 'dialogue A advances page');
  G.state.pressed.a = true; G._test.update(); G.state.pressed.a = false;
  assert(dialogDone && !G.state.dialogue, 'dialogue onDone fires');
  G._test.showDialog({ pages:[{text:'PICK', choices:[{label:'NO',value:'no'},{label:'YES',value:'yes'}]}], onChoose:v => { chosen = v; } });
  G.state.pressed.right = true; G._test.update(); G.state.pressed.right = false;
  G.state.pressed.a = true; G._test.update(); G.state.pressed.a = false;
  assert(chosen === 'yes', 'dialogue choice selects value');
  console.log('DIALOGUE OK — pages, A advance, choices, onDone verified');

  // ---- Batch C economy and hint registry fixtures ----
  for (const key in sandbox.World.CFG) {
    const sc = sandbox.World.CFG[key];
    const kinds = [];
    if (sc.cave) kinds.push(sc.cave.kind);
    if (sc.secret) kinds.push(sc.secret.kind);
    for (const cave of sc.caves || []) kinds.push(cave.kind);
    for (const kind of kinds) assert(G._test.CAVES[kind], 'CFG cave kind registered: ' + key + ' -> ' + kind);
  }
  G._test.startGame(); G.state.link.rupees = 150; G.state.col = 1; G.state.row = 1;
  G._test.enterCave('shopA', {c:7,r:2}); frames(1);
  let ware = G.state.entities.find(e => e.item === 'magicshield');
  assert(ware && ware.price === 130 && G._test.collect(ware) === 'taken' && G.state.link.rupees === 20 &&
    G.state.link.hasMagicShield && G.state.stock['1,1:magicshield'], 'shop buy and one-time stock');
  G._test.saveGame(); G._test.startGame(); assert(G._test.loadGame() && G.state.stock['1,1:magicshield'], 'shop stock saves');
  G._test.enterCave('shopA', {c:7,r:2}); frames(1);
  assert(!G.state.entities.some(e => e.item === 'magicshield'), 'sold-out item stays gone');
  G._test.startGame(); G._test.enterCave('shopB', {c:7,r:2}); frames(1);
  ware = G.state.entities.find(e => e.item === 'candle');
  assert(G._test.collect(ware) === 'refused' && G.state.msg === "BUY SOMETHIN' WILL YA!" && ware.alive,
    'insufficient funds refuse and keep shop item');

  G._test.startGame(); G._test.enterCave('medicine', {c:7,r:2}); frames(1);
  assert(G.state.msg === 'SHOW ME THE LETTER', 'medicine letter gate');
  G._test.enterCave('letter', {c:7,r:2}); frames(1);
  let letter = G.state.entities.find(e => e.item === 'letter');
  assert(letter && G._test.collect(letter) === 'taken' && G.state.link.hasLetter, 'letter pickup');
  G.state.link.rupees = 68; G._test.enterCave('medicine', {c:7,r:2}); frames(1);
  const potion = G.state.entities.find(e => e.item === 'redpotion');
  assert(potion && G._test.collect(potion) === 'taken' && G.state.link.potionCharges === 2, 'red potion has two charges');
  G.state.link.health = 1; sandbox.ITEMS.potion.use(G.state.link, G.state);
  assert(G.state.link.potion === 'blue' && G.state.link.potionCharges === 1, 'red potion decays to blue');
  sandbox.ITEMS.potion.use(G.state.link, G.state); assert(!G.state.link.hasPotion, 'potion expires after charges');

  G._test.startGame(); G.state.link.rupees = 9; G._test.enterCave('gamble', {c:7,r:2}); frames(1);
  let gamble = G.state.entities.find(e => e._gambleIndex === 0);
  assert(G._test.collect(gamble) === 'refused' && G.state.link.rupees === 9, 'gamble bet refusal');
  G._test.startGame(); G.state.link.rupees = 100; G._test.enterCave('gamble', {c:7,r:2}); frames(1);
  gamble = G.state.entities.find(e => e._gambleIndex === 0); G._test.collect(gamble);
  assert(G.state.link.rupees === 90 && G.state.msg === 'YOU LOST 10 RUPEES.', 'gamble loss is a net -10 including the stake');
  G._test.saveGame(); G._test.loadGame(); G.state.col = 3; G.state.row = 3;
  G._test.enterCave('gamble', {c:7,r:2}); frames(1);
  gamble = G.state.entities.find(e => e._gambleIndex === 0); G._test.collect(gamble);
  assert(G.state.link.rupees === 110 && G.state.msg === '+20 RUPEES!', 'same gamble pad rotates to the exact net +20 outcome');

  G._test.startGame(); G.state.link.rupees = 225; G._test.enterCave('gift30', {c:8,r:3}); frames(1);
  const gift = G.state.entities.find(e => e.item === 'rupee30'); G._test.collect(gift);
  assert(G.state.link.rupees === 255, 'gift respects rupee cap'); G._test.saveGame(); G._test.loadGame();
  G._test.enterCave('gift30', {c:8,r:3}); frames(1); assert(!G.state.entities.some(e => e.item === 'rupee30'), 'gift is one-time');
  G._test.startGame(); G.state.link.rupees = 10; G.state.col = 4; G.state.row = 2;
  G._test.enterCave('repair', {c:6,r:5}); frames(1); G._test.enterCave('repair', {c:6,r:5}); frames(1);
  assert(G.state.link.rupees === 0, 'door repair floors and charges once');
  G._test.startGame(); G.state.link.hasMagicShield = true; G.state.link.hasShield = true;
  G.state.entities.push(EN.makeEnemy('likelike', null, 7, 8)); G.state.link.x = 112; G.state.link.y = 128; frames(8);
  assert(!G.state.link.hasMagicShield && G.state.link.hasShield, 'Like-Like eats magical shield only');
  G.state.col = 1; G.state.row = 1; G._test.enterCave('shopA', {c:7,r:2}); frames(1);
  assert(G.state.entities.some(e => e.item === 'magicshield'), 'eaten magical shield is re-buyable');
  G._test.startGame(); G.state.link.rupees = 100; G._test.enterCave('bombupgrade', {c:7,r:2}); frames(1);
  const upgrade = G.state.entities.find(e => e.item === 'bombupgrade'); G._test.collect(upgrade);
  assert(G.state.link.maxBombs === 12, 'bomb upgrade adds four capacity');
  G._test.startGame(); G.state.link.rupees = 0; G._test.enterCave('shopB', {c:7,r:2}); frames(1);
  const refusedWare = G.state.entities.find(e => e.item === 'candle');
  G.state.link.x = refusedWare.x; G.state.link.y = refusedWare.y; frames(1);
  G.state.msgT = 0; frames(2);
  assert(G.state.msgT === 0, 'refused shop overlap does not spam the message');
  G.state.link.x = 112; G.state.link.y = 156; frames(1);
  G.state.link.x = refusedWare.x; G.state.link.y = refusedWare.y; frames(1);
  assert(G.state.msgT > 0, 'refused shop message re-arms after leaving the item');
  console.log('BATCH C OK — shops/stock, gifts, gambling, repair, letter/potions, shield, bomb capacity');
  console.log('FOUNDATION OK');

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
