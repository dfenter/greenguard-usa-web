/* world.js — overworld map (9 columns x 6 rows = 54 screens). Screens are
   GENERATED from a config so every screen is exactly 16x11 and edges open only
   toward neighbours that exist. Interior features are placed as overlays
   ("row,col,char"). Special walkable tiles: C cave, S stairs-cave, D dungeon. */

const World = (() => {
  const CFG = {
    // ===================== ROW 0 (north: Death Mountain, dungeons 1 & 2) =====================
    '0,0': { theme:'death', overlay:['2,3,A','2,11,A','5,5,R','5,10,R','7,7,A','3,8,H'],
      enemies:[['octorok','blue',4,4],['leever','tan',10,5],['tektite','blue',7,7]],
      secret:{ kind:'money' } },
    '1,0': { theme:'death', overlay:['3,3,R','3,12,R','7,3,R','7,12,R','5,7,D','2,5,R','2,10,R'],
      enemies:[['octorok','red',4,4],['octorok','red',11,6],['stalfos',null,3,8]],
      dungeon:{ level:1 } },
    '2,0': { theme:'death', overlay:['2,5,A','2,10,A','4,3,A','4,12,A','6,7,A','3,8,R','7,5,R'],
      enemies:[['leever','tan',4,5],['leever','tan',10,4],['lynel',null,8,6]] },
    '3,0': { theme:'death', overlay:['2,4,R','2,11,R','5,3,R','5,12,R','8,7,R','4,8,A'],
      enemies:[['octorok','blue',5,4],['stalfos',null,9,5],['tektite','blue',3,7]] },
    '4,0': { theme:'death', overlay:['3,3,R','3,12,R','7,3,R','7,12,R','5,7,D','2,6,A','2,9,A'],
      enemies:[['lynel',null,4,4],['stalfos',null,11,6],['octorok','blue',8,3]],
      dungeon:{ level:2 } },
    '5,0': { theme:'death', overlay:['2,5,R','2,10,R','5,4,A','5,11,A','8,7,R','4,3,R'],
      enemies:[['leever','tan',4,4],['lynel',null,10,6]] },

    // ===================== ROW 1 (upper-mid: forests, shops, water) =====================
    '0,1': { theme:'over', overlay:['1,2,T','1,3,T','8,2,T','8,12,T','4,10,T','6,4,T'],
      enemies:[['octorok','red',5,4],['moblin','brown',10,6]] },
    '1,1': { theme:'over', overlay:['1,3,T','1,12,T','3,4,T','3,11,T','6,4,T','6,11,T','8,3,T','8,12,T','2,7,S'],
      enemies:[['moblin','brown',4,5],['octorok','red',11,3]],
      cave:{ kind:'ring' } },
    '2,1': { theme:'over', overlay:['2,4,A','2,11,A','5,7,R','8,4,R','8,11,R','4,8,A'],
      enemies:[['tektite','orange',4,4],['tektite','orange',11,6],['leever','tan',8,5]] },
    '3,1': { theme:'over', overlay:['2,3,T','2,12,T','8,3,T','8,12,U','5,5,R'],
      enemies:[['lynel',null,6,4],['octorok','red',10,7],['moblin','brown',3,6]],
      secret:{ kind:'heartpiece' } },
    '4,1': { theme:'over', overlay:['1,4,T','1,11,T','3,3,T','3,12,T','7,5,T','7,10,T','2,7,S'],
      enemies:[['moblin','brown',5,5],['octorok','blue',10,4]],
      cave:{ kind:'raft' } },
    '5,1': { theme:'over', overlay:['2,2,W','2,3,W','3,2,W','3,3,W','7,11,W','7,12,W','8,11,W','8,12,W'],
      enemies:[['zola','blue',6,5],['octorok','blue',4,6]] },

    // ===================== ROW 2 (mid: lake, hub, graveyard, dungeon 3) =====================
    '0,2': { theme:'over', overlay:['2,3,W','2,4,W','3,3,W','3,4,W','5,9,W','6,9,W','6,10,W','8,4,T'],
      enemies:[['zola','blue',6,4],['octorok','blue',11,6]] },
    '1,2': { theme:'over', overlay:['1,4,T','1,11,T','4,3,T','4,12,T','7,4,U','7,11,T','9,6,T','9,9,T'],
      enemies:[['moblin','brown',5,4],['moblin','brown',10,6],['octorok','red',8,8]],
      secret:{ kind:'money' } },
    '2,2': { theme:'over', overlay:['2,3,R','2,12,R','8,3,R','8,12,R','5,6,H','5,9,R'],
      enemies:[['octorok','red',5,5],['tektite','orange',10,4]],
      secret:{ kind:'money' } },
    '3,2': { theme:'over', overlay:['2,4,G','2,11,G','5,7,G','8,4,G','8,11,G','5,3,T','5,12,T'],
      enemies:[['stalfos',null,4,4],['stalfos',null,11,6],['octorok','red',8,7]],
      cave:{ kind:'fairy' } },
    '4,2': { theme:'over', overlay:['2,3,R','2,12,R','6,5,R','6,10,R','8,7,R','4,4,R'],
      enemies:[['lynel',null,5,4],['leever','tan',10,6],['octorok','blue',8,3]] },
    '5,2': { theme:'death', overlay:['3,3,R','3,12,R','7,3,R','7,12,R','5,7,D','2,7,A'],
      enemies:[['lynel',null,4,5],['stalfos',null,11,5],['lynel',null,8,7]],
      dungeon:{ level:3 } },

    // ===================== ROW 3 (south: start area, gentle, shops) =====================
    '0,3': { theme:'over', overlay:['2,2,T','2,12,T','7,2,T','7,12,T','5,6,T','5,9,T'],
      enemies:[['octorok','red',4,5],['octorok','red',10,6]] },
    '1,3': { theme:'over', overlay:['1,3,T','1,12,T','4,4,T','4,11,T','7,4,T','7,11,T','2,7,S'],
      enemies:[['octorok','red',5,5],['moblin','brown',10,4]],
      cave:{ kind:'money' } },
    '2,3': { theme:'over', start:true, startPos:[7,8],
      overlay:['2,7,C','1,4,M','1,5,M','1,10,M','1,11,M','2,4,M','2,11,M','5,3,T','5,12,T','8,3,T','8,12,T','9,5,M','9,10,M'],
      enemies:[],
      cave:{ kind:'sword' } },
    '3,3': { theme:'over', overlay:['4,4,~','4,5,~','4,6,~','4,7,~','4,8,~','4,9,~','5,4,~','5,5,~','5,6,~','5,7,~','5,8,~','5,9,~','2,3,T','8,12,T'],
      enemies:[['octorok','blue',5,3],['leever','tan',10,6],['octorok','blue',11,4]] },
    '4,3': { theme:'over', overlay:['1,4,T','1,11,T','3,3,T','3,12,T','7,5,T','7,10,T','2,7,S'],
      enemies:[['moblin','brown',5,5],['octorok','red',10,6]],
      cave:{ kind:'candle' } },
    '5,3': { theme:'over', overlay:['2,3,R','2,12,R','5,5,R','5,10,R','8,7,R','7,4,U'],
      enemies:[['octorok','blue',5,4],['tektite','orange',10,6],['leever','tan',8,5]],
      secret:{ kind:'fairy' } },

    // ===================== ROW 4 (southern expansion) =====================
    '0,4': { theme:'over', overlay:['3,4,W','3,5,W','4,4,W','4,5,W','6,9,W','7,9,W'],
      enemies:[['leever','tan',5,5],['leever','tan',10,4],['zola','blue',8,6]] },
    '1,4': { theme:'over', overlay:['2,3,T','2,12,T','5,4,T','5,11,T','8,4,T','8,11,T'],
      enemies:[['goriya','brown',5,5],['goriya','brown',10,5],['tektite','orange',8,3]] },
    '2,4': { theme:'death', overlay:['3,3,G','3,12,G','5,5,G','5,10,G','7,4,G','7,11,G'],
      enemies:[['stalfos',null,5,4],['stalfos',null,10,5],['keese',null,8,7]] },
    '3,4': { theme:'over', overlay:['2,3,T','2,12,T','5,7,D','4,5,T','4,10,T'],
      enemies:[['ironknuckle',null,5,6],['goriya','brown',10,5]],
      dungeon:{ level:4 } },
    '4,4': { theme:'over', overlay:['2,4,T','2,11,T','5,4,T','5,11,T','8,3,T','8,12,T'],
      enemies:[['darknut',null,5,5],['darknut',null,10,4],['wizzrobe',null,8,7]] },
    '5,4': { theme:'over', overlay:['2,3,W','2,4,W','3,3,W','3,4,W','6,9,W','7,9,W'],
      enemies:[['zola','blue',7,5],['leever','tan',4,5],['leever','tan',10,6]] },
    '6,4': { theme:'over', overlay:['2,4,T','2,11,T','5,4,T','5,11,T','8,4,T','8,11,T'],
      enemies:[['goriya','brown',5,5],['goriya','brown',10,5]] },
    '7,4': { theme:'over', overlay:['2,3,R','2,12,R','5,5,R','5,10,R','8,7,R','4,7,S'],
      enemies:[['ironknuckle',null,6,5]],
      cave:{ kind:'whitesword' } },
    '8,4': { theme:'death', overlay:['2,4,R','2,11,R','5,5,R','5,10,R','8,7,R'],
      enemies:[['lynel',null,5,5],['darknut',null,10,4]] },

    // ===================== ROW 5 (southern shore) =====================
    '0,5': { theme:'over', overlay:['2,3,W','2,4,W','3,3,W','3,4,W','6,7,W','6,8,W','7,7,W','7,8,W'],
      enemies:[['zola','blue',6,5],['zola','blue',10,5]] },
    '1,5': { theme:'over', overlay:['2,3,T','2,12,T','5,4,T','5,11,T'],
      enemies:[['goriya','brown',5,5],['likelike',null,10,6]] },
    '2,5': { theme:'over', overlay:['3,3,R','3,12,R','7,3,R','7,12,R','5,7,S'],
      enemies:[['stalfos',null,5,6],['stalfos',null,10,6]],
      cave:{ kind:'fairy' } },
    '3,5': { theme:'over', overlay:['2,3,W','3,3,W','2,4,W','3,4,W','7,10,W','7,11,W','8,10,W','8,11,W'],
      enemies:[['leever','tan',6,5],['leever','tan',10,4],['zola','blue',8,7]] },
    '4,5': { theme:'over', overlay:['2,4,T','2,11,T','4,5,T','4,10,T','7,5,T','7,10,T','5,7,D'],
      enemies:[['wizzrobe',null,6,4],['goriya','brown',10,7]],
      dungeon:{ level:5 } },
    '5,5': { theme:'over', overlay:['3,3,W','3,4,W','4,3,W','4,4,W','6,9,W','7,9,W','5,7,K'],
      enemies:[['leever','tan',8,5]] },
    '6,5': { theme:'over', overlay:['2,3,W','2,4,W','3,3,W','3,4,W','7,9,W','7,10,W','8,9,W','8,10,W'],
      enemies:[['zola','blue',6,5],['leever','tan',10,5]] },
    '7,5': { theme:'over', overlay:['3,3,W','3,4,W','4,3,W','4,4,W','6,9,W','7,9,W','5,7,D'],
      enemies:[['goriya','brown',5,5],['ironknuckle',null,10,5]],
      dungeon:{ level:6 } },
    '8,5': { theme:'over', overlay:['2,3,T','2,12,T','5,4,T','5,11,T','8,4,T','8,11,T'],
      enemies:[['goriya','brown',5,5],['goriya','brown',10,4],['ironknuckle',null,8,7]] },

    // ===================== COLS 6-8, ROWS 0-3 (eastern expansion) =====================
    '6,0': { theme:'death', overlay:['2,4,R','2,11,R','5,5,R','5,10,R','8,7,R'],
      enemies:[['lynel',null,5,5],['lynel',null,10,4],['tektite','blue',8,7]] },
    '7,0': { theme:'death', overlay:['2,4,R','2,11,R','5,5,R','5,10,R'],
      enemies:[['lynel',null,5,5],['tektite','blue',10,4],['tektite','blue',8,6]] },
    '8,0': { theme:'death', overlay:['2,4,R','2,11,R','5,5,H','5,10,R','8,7,R'],
      enemies:[['lynel',null,5,5],['lynel',null,10,4]],
      secret:{ kind:'heartpiece' } },
    '6,1': { theme:'over', overlay:['2,3,T','2,12,T','5,4,T','5,11,T','8,4,T','8,11,T'],
      enemies:[['goriya','brown',5,5],['goriya','brown',10,4],['darknut',null,8,7]] },
    '7,1': { theme:'over', overlay:['2,3,T','2,12,T','5,4,T','5,11,T'],
      enemies:[['wizzrobe',null,6,5],['stalfos',null,4,4],['stalfos',null,11,6]] },
    '8,1': { theme:'over', overlay:['2,4,R','2,11,R','5,5,R','5,10,R','5,7,S'],
      enemies:[['ironknuckle',null,5,5],['darknut',null,10,6]],
      cave:{ kind:'magicsword' } },
    '6,2': { theme:'over', overlay:['2,3,W','2,4,W','3,3,W','3,4,W','6,9,W','7,9,W'],
      enemies:[['leever','tan',5,5],['leever','tan',10,5],['zola','blue',8,6]] },
    '7,2': { theme:'over', overlay:['2,3,T','2,12,T','5,4,U','5,11,T','8,4,T','8,11,T'],
      enemies:[['likelike',null,5,5],['goriya','brown',4,4],['goriya','brown',11,6]],
      secret:{ kind:'money' } },
    '8,2': { theme:'death', overlay:['2,4,R','2,11,R','5,5,R','5,10,R'],
      enemies:[['darknut',null,5,5],['darknut',null,10,4]] },
    '6,3': { theme:'over', overlay:['2,3,T','2,12,T','5,4,T','5,11,T','8,4,T','8,11,T'],
      enemies:[['goriya','brown',5,5],['goriya','brown',10,4]] },
    '7,3': { theme:'over', overlay:['2,3,T','2,12,T','5,4,T','5,11,T','8,4,T','8,11,T'],
      enemies:[['darknut',null,5,5],['stalfos',null,4,4],['stalfos',null,11,6]] },
    '8,3': { theme:'over', overlay:['2,4,R','2,11,R','5,5,R','5,10,R','5,7,S'],
      enemies:[['ironknuckle',null,6,5]],
      cave:{ kind:'firerod' } },

    // ===================== FRONTIER (generated wilderness south & east) =====================
    // Hand-placed landmarks inside the procedurally generated expansion: two more
    // dungeons and a handful of secret caves so the new lands are worth exploring.
    '10,6': { theme:'death', overlay:['2,4,R','2,11,R','3,3,R','3,12,R','7,3,R','7,12,R','5,7,D','8,5,R','8,10,R'],
      enemies:[['darknut',null,4,4],['lynel',null,11,6],['wizzrobe',null,8,3]],
      dungeon:{ level:7 } },
    '3,11': { theme:'death', overlay:['2,4,R','2,11,R','3,3,R','3,12,R','7,3,R','7,12,R','5,7,D','8,6,R','8,9,R'],
      enemies:[['ironknuckle',null,4,4],['darknut',null,11,6],['lynel',null,8,7]],
      dungeon:{ level:8 } },
    '6,8': { theme:'over', overlay:['3,3,T','3,12,T','7,3,T','7,12,T','5,7,S'],
      enemies:[['goriya','blue',4,5],['goriya','blue',11,5]],
      cave:{ kind:'fairy' } },
    '9,9': { theme:'over', overlay:['2,3,R','2,12,R','8,3,R','8,12,R','5,7,S'],
      enemies:[['darknut',null,5,5],['wizzrobe',null,10,5]],
      cave:{ kind:'money' } },
    '2,12': { theme:'over', overlay:['2,4,T','2,11,T','7,4,T','7,11,T','5,7,C'],
      enemies:[['lynel',null,5,5],['lynel',null,10,5]],
      cave:{ kind:'heartpiece' } },
    '11,11': { theme:'death', overlay:['2,4,R','2,11,R','7,4,R','7,11,R','5,7,C'],
      enemies:[['ironknuckle',null,5,5],['darknut',null,10,5]],
      cave:{ kind:'heartpiece' } },
  };

  // Full world bounds. The 54 authored screens (cols 0-8, rows 0-5) are the core
  // of Hyrule; the rest of this rectangle is filled by a deterministic generator
  // so the overworld is ~3x larger to explore (168 screens total).
  const COLS_W = 12, ROWS_W = 14;
  function inBounds(c, r) { return c >= 0 && c < COLS_W && r >= 0 && r < ROWS_W; }
  function has(c, r) { return inBounds(c, r); }   // full rectangle: every cell exists

  // ---- deterministic per-cell generator (no Math.random: stable across reloads) ----
  function cellRand(col, row) {
    let s = (((col + 7) * 73856093) ^ ((row + 13) * 19349663)) >>> 0;
    if (!s) s = 1;
    return function () { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
  }
  // interior slots that never sit in a door corridor (cols 7-8 / rows 4-6 at edges)
  const DECO_SLOTS = [[2,2],[2,5],[2,10],[2,13],[8,2],[8,5],[8,10],[8,13],[3,3],[3,12],[7,3],[7,12]];
  const ENEMY_SLOTS = [[4,4],[11,4],[7,6],[5,5],[10,6],[7,3],[4,8]];   // [col,row]
  const genCache = {};
  function genScreen(col, row) {
    const k = col + ',' + row;
    if (genCache[k]) return genCache[k];
    const rnd = cellRand(col, row);
    const dist = Math.abs(col - 2) + Math.abs(row - 3);   // distance from the start screen
    const theme = (row <= 1) ? 'death' : 'over';
    const deco = ['T','R','G','W','T','R'][Math.floor(rnd() * 6)];   // bias toward trees/rocks
    // decoration clusters
    const overlay = [];
    const pool = DECO_SLOTS.slice();
    const nDeco = 3 + Math.floor(rnd() * 3);
    for (let i = 0; i < nDeco && pool.length; i++) {
      const [r, c] = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
      overlay.push(r + ',' + c + ',' + deco);
      if (rnd() < 0.5) { const c2 = c + 1; if (c2 <= 13 && c2 !== 7 && c2 !== 8) overlay.push(r + ',' + c2 + ',' + deco); }
    }
    // enemies — pool widens (harder) the farther you roam from the start
    let epool = ['octorok','tektite','leever','moblin'];
    if (dist > 3) epool = epool.concat(['stalfos','goriya','zola']);
    if (dist > 6) epool = epool.concat(['lynel','darknut','wizzrobe']);
    if (dist > 9) epool = epool.concat(['ironknuckle','darknut','lynel']);
    const variantFor = (t) =>
      t === 'octorok' ? (rnd() < 0.5 ? 'red' : 'blue') :
      t === 'tektite' ? (rnd() < 0.5 ? 'orange' : 'blue') :
      t === 'goriya'  ? (dist > 7 ? 'blue' : 'brown') :
      t === 'moblin'  ? 'brown' : null;
    const enemies = [];
    const espool = ENEMY_SLOTS.slice();
    const nEnem = 2 + Math.floor(rnd() * 2);
    for (let i = 0; i < nEnem && espool.length; i++) {
      const t = epool[Math.floor(rnd() * epool.length)];
      const [c, r] = espool.splice(Math.floor(rnd() * espool.length), 1)[0];
      enemies.push([t, variantFor(t), c, r]);
    }
    return (genCache[k] = { theme, overlay, enemies, _gen: true });
  }

  // unified config lookup: authored screens win, else generate
  function cfgFor(col, row) {
    if (!inBounds(col, row)) return null;
    return CFG[col + ',' + row] || genScreen(col, row);
  }

  function build(col, row) {
    const cfg = cfgFor(col, row);
    if (!cfg) return null;
    const g = [];
    for (let r = 0; r < 11; r++) {
      const a = [];
      for (let c = 0; c < 16; c++)
        a.push((r === 0 || r === 10 || c === 0 || c === 15) ? 'M' : '.');
      g.push(a);
    }
    if (has(col, row - 1)) { g[0][7] = '.'; g[0][8] = '.'; }
    if (has(col, row + 1)) { g[10][7] = '.'; g[10][8] = '.'; }
    if (has(col - 1, row)) { g[4][0] = '.'; g[5][0] = '.'; }
    if (has(col + 1, row)) { g[4][15] = '.'; g[5][15] = '.'; }
    for (const o of (cfg.overlay || [])) {
      const [r, c, ch] = o.split(',');
      g[+r][+c] = ch;
    }
    return g.map(a => a.join(''));
  }

  const cache = {};
  function get(col, row) {
    const k = col + ',' + row;
    const cfg = cfgFor(col, row);
    if (!cfg) return null;
    if (!cache[k]) cache[k] = Object.assign({}, cfg, { rows: build(col, row) });
    return cache[k];
  }

  function findStart() {
    for (const k in CFG) if (CFG[k].start) {
      const [c, r] = k.split(',').map(Number);
      return { col: c, row: r, screen: get(c, r) };
    }
    return { col: 2, row: 3, screen: get(2, 3) };
  }

  return { get, findStart, has, CFG, COLS_W, ROWS_W };
})();
