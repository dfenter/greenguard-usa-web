/* world.js — overworld map (9 columns x 6 rows = 54 screens). Screens are
   GENERATED from a config so every screen is exactly 16x11 and edges open only
   toward neighbours that exist. Interior features are placed as overlays
   ("row,col,char"). Special walkable tiles: C cave, S stairs-cave, D dungeon. */

const World = (() => {
  const CFG = {
    // ===================== ROW 0 (north: Death Mountain, dungeons 1 & 2) =====================
    '0,0': { theme:'death', overlay:['2,3,A','2,11,A','5,5,R','5,10,R','7,7,A','3,8,H'],
      enemies:[['octorok','blue',4,4],['leever','tan',9,5],['tektite','blue',6,7]],
      secret:{ kind:'gift30' } },
    '1,0': { theme:'death', overlay:['3,3,R','3,12,R','7,3,R','7,12,R','5,7,D','2,5,R','2,10,R'],
      enemies:[['octorok','red',4,4],['octorok','red',11,6],['stalfos',null,3,8]],
      dungeon:{ level:1 } },
    '2,0': { theme:'death', overlay:['2,5,A','2,10,A','4,3,A','4,12,A','6,7,A','3,8,R','7,5,R'],
      enemies:[['leever','tan',4,5],['leever','tan',10,4],['lynel',null,8,6]] },
    '3,0': { theme:'death', overlay:['2,4,R','2,11,R','5,3,R','5,12,R','8,7,R','4,8,A'],
      enemies:[['octorok','blue',5,4],['stalfos',null,9,5],['tektite','blue',3,7]] },
    '4,0': { theme:'death', overlay:['3,3,R','3,12,R','7,3,R','7,12,R','5,7,D','2,6,A','2,9,A','5,4,C'],
      enemies:[['lynel',null,4,4],['stalfos',null,11,6],['octorok','blue',8,3]],
      dungeon:{ level:2 }, cave:{ kind:'hintCracks' } },
    '5,0': { theme:'death', overlay:['2,5,R','2,10,R','5,4,A','5,11,A','8,7,R','4,3,R'],
      enemies:[['leever','tan',4,4],['lynel',null,10,6]] },

    // ===================== ROW 1 (upper-mid: forests, shops, water) =====================
    '0,1': { theme:'over', overlay:['1,2,T','1,3,T','8,2,T','8,12,T','4,10,T','6,4,T','5,7,C'],
      enemies:[['octorok','red',5,4],['moblin','brown',10,6]], cave:{ kind:'letter' } },
    '1,1': { theme:'over', overlay:['1,3,T','1,12,T','3,4,T','3,11,T','6,4,T','6,11,T','8,3,T','8,12,T','2,7,S'],
      enemies:[['moblin','brown',4,5],['octorok','red',10,3]],
      cave:{ kind:'shopA' } },
    '2,1': { theme:'over', overlay:['2,4,A','2,11,A','5,7,R','8,4,R','8,11,R','4,8,A'],
      enemies:[['tektite','orange',4,4],['tektite','orange',11,6],['leever','tan',8,5]] },
    '3,1': { theme:'over', overlay:['2,3,T','2,12,T','8,3,T','8,12,U','5,5,R'],
      enemies:[['lynel',null,6,4],['octorok','red',10,7],['moblin','brown',3,6]],
      secret:{ kind:'heartpiece' } },
    '4,1': { theme:'over', overlay:['1,4,T','1,11,T','3,3,T','3,12,T','7,5,T','7,10,T','2,7,S'],
      enemies:[['moblin','brown',5,5],['octorok','blue',10,4]],
      cave:{ kind:'raft' } },
    '5,1': { theme:'over', overlay:['2,2,W','2,3,W','3,2,W','3,3,W','7,11,W','7,12,W','8,11,W','8,12,W','5,7,S'],
      enemies:[['zola','blue',6,5],['octorok','blue',4,6]], cave:{ kind:'hintFlame' } },

    // ===================== ROW 2 (mid: lake, hub, graveyard, dungeon 3) =====================
    '0,2': { theme:'over', overlay:['2,3,W','2,4,W','3,3,W','3,4,W','5,9,W','6,9,W','6,10,W','8,4,T'],
      enemies:[['zola','blue',6,4],['octorok','blue',11,6]] },
    '1,2': { theme:'over', overlay:['1,4,T','1,11,T','4,3,T','4,12,T','7,4,U','7,11,T','9,6,T','9,9,T'],
      enemies:[['moblin','brown',5,4],['moblin','brown',10,6],['octorok','red',8,8]],
      secret:{ kind:'gift100' } },
    '2,2': { theme:'over', overlay:['2,3,R','2,12,R','8,3,R','8,12,R','5,6,H','5,9,R'],
      enemies:[['octorok','red',5,5],['tektite','orange',10,4]],
      secret:{ kind:'gamble' } },
    '3,2': { theme:'over', overlay:['2,4,G','2,11,G','5,7,C','8,4,G','8,11,G','5,3,T','5,12,T'],
      enemies:[['stalfos',null,4,4],['stalfos',null,11,6],['octorok','red',8,7]],
      cave:{ kind:'fairy' } },
    '4,2': { theme:'over', overlay:['2,3,R','2,12,R','6,5,R','6,10,R','8,7,R','4,4,R','5,6,H'],
      enemies:[['lynel',null,5,4],['leever','tan',9,6],['octorok','blue',8,3]], secret:{ kind:'repair' } },
    '5,2': { theme:'death', overlay:['3,3,R','3,12,R','7,3,R','7,12,R','5,7,D','2,7,A'],
      enemies:[['lynel',null,4,5],['stalfos',null,11,5],['lynel',null,8,7]],
      dungeon:{ level:3 } },

    // ===================== ROW 3 (south: start area, gentle, shops) =====================
    '0,3': { theme:'over', overlay:['2,2,T','2,12,T','7,2,T','7,12,T','5,6,T','5,9,T'],
      enemies:[['octorok','red',4,5],['octorok','red',10,6]] },
    '1,3': { theme:'over', overlay:['1,3,T','1,12,T','4,4,T','4,11,T','7,4,T','7,11,T','2,7,S'],
      enemies:[['octorok','red',5,5],['moblin','brown',10,4]],
      cave:{ kind:'shopC' } },
    '2,3': { theme:'over', start:true, startPos:[7,8],
      overlay:['2,7,C','1,4,M','1,5,M','1,10,M','1,11,M','2,4,M','2,11,M','5,3,T','5,12,T','8,3,T','8,12,T','9,5,M','9,10,M'],
      enemies:[],
      cave:{ kind:'sword' } },
    '3,3': { theme:'over', overlay:['4,4,~','4,5,~','4,6,~','4,7,~','4,8,~','4,9,~','5,4,~','5,5,~','5,6,~','5,7,~','5,8,~','5,9,~','2,3,T','8,12,T'],
      enemies:[['octorok','blue',5,3],['leever','tan',10,6],['octorok','blue',11,4]] },
    '4,3': { theme:'over', overlay:['1,4,T','1,11,T','3,3,T','3,12,T','7,5,T','7,10,T','2,7,S'],
      enemies:[['moblin','brown',5,5],['octorok','red',10,6]],
      cave:{ kind:'shopB' } },
    '5,3': { theme:'over', overlay:['2,3,R','2,12,R','5,5,R','5,10,R','8,7,R','7,4,U'],
      enemies:[['octorok','blue',5,4],['tektite','orange',10,6],['leever','tan',8,5]],
      secret:{ kind:'fairy' } },

    // ===================== ROW 4 (southern expansion) =====================
    '0,4': { theme:'over', overlay:['3,4,W','3,5,W','4,4,W','4,5,W','6,9,W','7,9,W'],
      enemies:[['leever','tan',5,5],['leever','tan',10,4],['zola','blue',8,6]] },
    '1,4': { theme:'over', overlay:['2,3,T','2,12,T','5,4,T','5,11,T','8,4,T','8,11,T'],
      enemies:[['goriya','brown',5,5],['goriya','brown',10,5],['tektite','orange',8,3]] },
    '2,4': { theme:'death', overlay:['3,3,G','3,12,G','5,5,G','5,10,G','7,4,G','7,11,G'],
      enemies:[['stalfos',null,5,4],['stalfos',null,9,5],['keese',null,8,7]] },
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
      enemies:[['lynel',null,4,5],['darknut',null,10,4]] },

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
      enemies:[['wizzrobe',null,6,4],['goriya','brown',9,7]],
      dungeon:{ level:5 } },
    '5,5': { theme:'over', overlay:['3,3,W','3,4,W','4,3,W','4,4,W','6,9,W','7,9,W','5,7,K'],
      enemies:[['leever','tan',8,5]], secret:{kind:'lakeSecret', interaction:'whistle'} },
    '6,5': { theme:'over', overlay:['2,3,W','2,4,W','3,3,W','3,4,W','7,9,W','7,10,W','8,9,W','8,10,W','5,7,K'],
      enemies:[['zola','blue',6,5],['leever','tan',10,5]] },
    '7,5': { theme:'over', overlay:['3,3,W','3,4,W','4,3,W','4,4,W','6,9,W','7,9,W','5,7,D'],
      enemies:[['goriya','brown',5,5],['ironknuckle',null,10,5]],
      dungeon:{ level:6 } },
    '8,5': { theme:'over', overlay:['2,3,T','2,12,T','5,4,T','5,11,T','8,4,T','8,11,T','5,7,K'],
      enemies:[['goriya','brown',5,5],['goriya','brown',10,4],['ironknuckle',null,8,7]] },

    // ===================== COLS 6-8, ROWS 0-3 (eastern expansion) =====================
    '6,0': { theme:'death', overlay:['2,4,R','2,11,R','5,5,R','5,10,R','8,7,R'],
      enemies:[['lynel',null,4,5],['lynel',null,10,4],['tektite','blue',8,7]] },
    '7,0': { theme:'death', overlay:['2,4,R','2,11,R','5,5,R','5,10,R'],
      enemies:[['lynel',null,4,5],['tektite','blue',10,4],['tektite','blue',8,6]] },
    '8,0': { theme:'death', overlay:['2,4,R','2,11,R','5,5,H','5,10,R','8,7,R'],
      enemies:[['lynel',null,4,5],['lynel',null,10,4]],
      secret:{ kind:'heartpiece' } },
    '6,1': { theme:'over', overlay:['2,3,T','2,12,T','5,4,T','5,11,T','8,4,T','8,11,T','5,7,C'],
      enemies:[['goriya','brown',5,5],['goriya','brown',10,4],['darknut',null,8,7]], cave:{ kind:'hintWoods' } },
    '7,1': { theme:'over', overlay:['2,3,T','2,12,T','5,4,T','5,11,T'],
      enemies:[['wizzrobe',null,6,5],['stalfos',null,4,4],['stalfos',null,11,6]] },
    '8,1': { theme:'over', overlay:['2,4,R','2,11,R','5,5,R','5,10,R','5,7,S'],
      enemies:[['ironknuckle',null,4,5],['darknut',null,10,6]],
      cave:{ kind:'magicsword' } },
    '6,2': { theme:'over', overlay:['2,3,W','2,4,W','3,3,W','3,4,W','6,9,W','7,9,W'],
      enemies:[['leever','tan',5,5],['leever','tan',10,5],['zola','blue',8,6]] },
    '7,2': { theme:'over', overlay:['2,3,T','2,12,T','5,4,U','5,11,T','8,4,T','8,11,T'],
      enemies:[['likelike',null,5,5],['goriya','brown',4,4],['goriya','brown',11,6]],
      secret:{ kind:'gift30' } },
    '8,2': { theme:'death', overlay:['2,4,R','2,11,R','5,5,R','5,10,R'],
      enemies:[['darknut',null,4,5],['darknut',null,10,4]] },
    '6,3': { theme:'over', overlay:['2,3,T','2,12,T','5,4,T','5,11,T','8,4,T','8,11,T','5,7,S'],
      enemies:[['goriya','brown',5,5],['goriya','brown',10,4]], cave:{ kind:'medicine' } },
    '7,3': { theme:'over', overlay:['2,3,T','2,12,T','5,4,T','5,11,T','8,4,T','8,11,T','5,7,C'],
      enemies:[['darknut',null,5,5],['stalfos',null,4,4],['stalfos',null,11,6]], cave:{ kind:'hintL7' } },
    '8,3': { theme:'over', overlay:['2,4,R','2,11,R','5,5,R','5,10,R','5,7,S'],
      enemies:[['ironknuckle',null,6,5]],
      cave:{ kind:'firerod' } },

    // ===================== FRONTIER (generated wilderness south & east) =====================
    // Hand-placed landmarks inside the procedurally generated expansion: two more
    // dungeons and a handful of secret caves so the new lands are worth exploring.
    '10,6': { theme:'death', overlay:['2,4,R','2,11,R','3,3,R','3,12,R','7,3,R','7,12,R','8,5,R','8,10,R'],
      enemies:[['darknut',null,4,4],['lynel',null,11,6],['wizzrobe',null,8,3]],
      dungeon:{ level:7 }, hiddenDungeon:true, caves:[{r:5,c:4,kind:'hintSteel'}] },
    '3,11': { theme:'death', overlay:['2,4,R','2,11,R','3,3,R','3,12,R','7,3,R','7,12,R','5,7,D','8,6,R','8,9,R'],
      enemies:[['ironknuckle',null,4,4],['darknut',null,11,6],['lynel',null,8,7]],
      dungeon:{ level:8 }, caves:[{r:5,c:4,kind:'hintL8'}] },
    '6,8': { theme:'over', overlay:['3,3,T','3,12,T','7,3,T','7,12,T','5,7,S','5,4,C'],
      enemies:[['goriya','blue',4,5],['goriya','blue',11,5]],
      cave:{ kind:'fairy' }, caves:[{r:5,c:4,kind:'hintBomb'}] },
    '9,9': { theme:'over', overlay:['2,3,R','2,12,R','8,3,R','8,12,R','5,7,S','5,4,C'],
      enemies:[['darknut',null,5,5],['wizzrobe',null,10,5]],
      cave:{ kind:'frontierShop' }, caves:[{r:5,c:4,kind:'hintCourage'}] },
    '9,6': { theme:'over', overlay:['2,3,R','2,12,R','8,3,R','8,12,R','5,7,C'],
      enemies:[['lynel',null,5,5],['goriya','blue',10,5]], cave:{ kind:'hintShore' } },
    '7,7': { theme:'over', overlay:['2,3,T','2,12,T','8,3,T','8,12,T','5,7,S'],
      enemies:[['goriya','blue',5,5],['darknut',null,10,5]], cave:{ kind:'bombupgrade' } },
    '1,9': { theme:'over', overlay:['2,3,R','2,12,R','8,3,R','8,12,R','5,7,S'],
      enemies:[['stalfos',null,5,5],['lynel',null,10,5]], cave:{ kind:'bombupgrade' } },
    '2,12': { theme:'over', overlay:['2,4,T','2,11,T','7,4,T','7,11,T','5,7,C','5,4,S'],
      enemies:[['lynel',null,5,5],['lynel',null,10,5]],
      cave:{ kind:'heartpiece' }, caves:[{r:5,c:4,kind:'hintRoad'}] },
    '11,11': { theme:'death', overlay:['2,4,R','2,11,R','7,4,R','7,11,R','5,7,C'],
      enemies:[['ironknuckle',null,5,5],['darknut',null,10,5]],
      cave:{ kind:'heartpiece' } },
    '11,0': { theme:'death', overlay:['2,4,R','2,11,R','3,3,R','3,12,R','5,5,R','5,10,R','7,4,R','7,11,R','5,7,R'],
      enemies:[['lynel',null,4,4],['darknut',null,11,6],['wizzrobe',null,8,3]],
      dungeon:{ level:9, hidden:true }, hiddenDungeon:true },

    // E authored frontier secrets. The two shortcut endpoints are one logical
    // two-way cave; the other two bracelet gates are deliberately dead-end payoffs.
    '9,1': { theme:'death', overlay:['2,4,R','2,11,R','5,7,A','8,4,R','8,11,R'],
      enemies:[['lynel',null,5,4],['tektite','blue',10,6]],
      secret:{ kind:'powerbracelet', interaction:'push', requires:'powerbracelet' } },
    '0,7': { theme:'over', overlay:['2,3,T','2,12,T','8,3,T','8,12,T','5,7,G'],
      enemies:[['moblin','brown',5,5]],
      secret:{ kind:'shortcutWest', interaction:'push', requires:'powerbracelet' } },
    '11,7': { theme:'over', overlay:['2,4,T','2,11,T','8,4,T','8,11,T','5,7,G'],
      enemies:[['goriya','blue',5,5]],
      secret:{ kind:'shortcutEast', interaction:'push', requires:'powerbracelet' } },
    '10,4': { theme:'over', overlay:['2,3,R','2,12,R','8,3,R','8,12,R','5,7,A'],
      enemies:[['leever','tan',5,5],['tektite','orange',10,5]],
      secret:{ kind:'vault100', interaction:'push', requires:'powerbracelet' } },
    '9,7': { theme:'over', overlay:['2,3,T','2,12,T','8,3,T','8,12,T','5,7,G'],
      enemies:[['goriya','blue',5,5],['leever','tan',10,5]],
      secret:{ kind:'braceletFairy', interaction:'push', requires:'powerbracelet' } },
    '1,12': { theme:'over', overlay:['2,3,T','2,12,T','8,3,T','8,12,T','5,7,C'],
      enemies:[['moblin','brown',5,5]], cave:{ kind:'heartpiece' } },
    '11,13': { theme:'over', overlay:['2,4,W','2,11,W','8,4,W','8,11,W','5,7,C'],
      enemies:[['zola','blue',5,5]], cave:{ kind:'heartpiece' } },
  };

  const SECRET_TILES = {
    '0,0':[8,3], '3,1':[12,8], '1,2':[4,7], '2,2':[6,5], '4,2':[6,5],
    '5,3':[4,7], '8,0':[5,5], '7,2':[4,5], '5,5':[7,5],
    '9,1':[7,5], '0,7':[7,5], '11,7':[7,5], '10,4':[7,5], '9,7':[7,5],
  };
  for (const k in SECRET_TILES) {
    const secret = CFG[k] && CFG[k].secret, [c, r] = SECRET_TILES[k] || [];
    if (secret) secret.tile = { c, r };
  }

  // Full world bounds. The 54 authored screens (cols 0-8, rows 0-5) are the core
  // of Hyrule; the rest of this rectangle is filled by a deterministic generator
  // so the overworld is ~3x larger to explore (168 screens total).
  const COLS_W = 12, ROWS_W = 14;
  function inBounds(c, r) { return c >= 0 && c < COLS_W && r >= 0 && r < ROWS_W; }
  function has(c, r) { return inBounds(c, r); }   // full rectangle: every cell exists

  const CORE_C = 9, CORE_R = 6;
  const MOUNTAIN_PASSES = Object.freeze([2, 5, 7]);
  const RIVER_FORDS = Object.freeze([1, 4, 7, 10]);
  function isCore(c, r) { return c >= 0 && c < CORE_C && r >= 0 && r < CORE_R; }
  function normalizedEdge(c1, r1, c2, r2) {
    return (r1 < r2 || (r1 === r2 && c1 <= c2)) ? [c1,r1,c2,r2] : [c2,r2,c1,r1];
  }
  function isRiverEdge(c1, r1, c2, r2) {
    return c1 === c2 && ((r1 === 7 && r2 === 8) || (r1 === 8 && r2 === 7));
  }
  function mountainRidgeEdge(c1, r1, c2, r2) {
    const lo = Math.min(c1,c2), hi = Math.max(c1,c2);
    return r1 === r2 && r1 <= 7 && ((lo === 9 && hi === 10) || (lo === 10 && hi === 11));
  }
  function edgeOpen(c1, r1, c2, r2) {
    // Accept {col,row} points as a convenience for tooling while keeping the
    // public four-number form pure and allocation-free in normal play.
    if (c1 && typeof c1 === 'object') {
      const a = c1, b = r1;
      c1 = a.col === undefined ? a.c : a.col; r1 = a.row === undefined ? a.r : a.row;
      c2 = b.col === undefined ? b.c : b.col; r2 = b.row === undefined ? b.r : b.row;
    }
    if (![c1,r1,c2,r2].every(Number.isInteger) || !inBounds(c1,r1) || !inBounds(c2,r2)) return false;
    if (Math.abs(c1-c2) + Math.abs(r1-r2) !== 1) return false;
    if (isCore(c1,r1) && isCore(c2,r2)) return true;
    const [a,b,c,d] = normalizedEdge(c1,r1,c2,r2);
    if ((a === 0 && b === 13 && c === 1 && d === 13) ||
        (a === 10 && b === 13 && c === 11 && d === 13)) return false; // two rewards are dead ends
    if (mountainRidgeEdge(c1,r1,c2,r2)) return MOUNTAIN_PASSES.includes(r1);
    if (c1 === c2 && ((r1 === 1 && r2 === 2) || (r1 === 2 && r2 === 1)) && c1 >= 9) {
      return c1 === 9 || c1 === 10 || c1 === 11;
    }
    if (isRiverEdge(c1,r1,c2,r2)) return RIVER_FORDS.includes(c1);
    return true;
  }

  function biomeFor(col, row) {
    if (row <= 1 || (col >= 10 && col <= 11 && row <= 7)) return 'mountain';
    if (row >= 8 && row <= 9 && col >= 1 && col <= 2) return 'graveyard';
    if (col >= 4 && col <= 7 && row >= 4 && row <= 6) return 'lake';
    if (row === 13 || (col === 11 && row >= 8)) return 'coast';
    if (row >= 6 && col <= 5) return 'forest';
    if (row >= 6 && col >= 6) return 'desert';
    return 'grass';
  }
  function themeForBiome(biome) { return biome === 'mountain' || biome === 'graveyard' ? 'death' : 'over'; }

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
    const biome = biomeFor(col, row), theme = themeForBiome(biome);
    const overlay = [];
    const put = (r, c, ch) => { if (r >= 1 && r <= 9 && c >= 1 && c <= 14) overlay.push(r + ',' + c + ',' + ch); };
    const pool = DECO_SLOTS.slice();
    const take = () => pool.length ? pool.splice(Math.floor(rnd() * pool.length), 1)[0] : [5,5];
    if (biome === 'mountain') {
      for (let i = 0; i < 4; i++) { const [r,c] = take(); put(r,c,'R'); }
      if (col % 2 === 0) put(4, 7, 'M');
    } else if (biome === 'forest') {
      for (const [r,c] of [[2,3],[2,11],[8,3],[8,11]]) put(r,c,'T');
      put(5,7,'T');
    } else if (biome === 'desert') {
      for (const [r,c] of [[2,3],[2,12],[5,4],[5,11],[8,3],[8,12]]) put(r,c,'~');
      if (rnd() < 0.5) put(5,7,'R');
    } else if (biome === 'lake') {
      for (const [r,c] of [[3,3],[3,4],[4,3],[4,4],[7,9],[7,10]]) put(r,c,'W');
      put(5,7,'K');
    } else if (biome === 'coast') {
      for (const [r,c] of [[2,3],[2,4],[3,3],[3,4],[8,11],[8,12]]) put(r,c,'W');
      put(5,7,'~');
    } else if (biome === 'graveyard') {
      for (const [r,c] of [[2,3],[2,6],[2,10],[8,3],[8,6],[8,10]]) put(r,c,'G');
    } else {
      const deco = ['T','R','G','T','R'][Math.floor(rnd() * 5)];
      for (let i = 0; i < 4; i++) { const [r,c] = take(); put(r,c,deco); }
    }
    // Optional secrets remain stable by screen ID, and their tile type follows
    // the biome so the authored geography remains legible.
    let secret = null;
    if (rnd() < 0.18) {
      const [sr, sc] = take();
      const interaction = biome === 'forest' || biome === 'graveyard' ? 'burn' :
        biome === 'mountain' ? 'bomb' : (rnd() < 0.5 ? 'bomb' : 'push');
      const tile = interaction === 'burn' ? 'U' : interaction === 'push' ? (biome === 'graveyard' ? 'G' : 'A') : 'H';
      const kinds = ['gift30','gift100','fairy','money','bombpack','hintCracks','hintRoad'];
      const kind = kinds[Math.floor(rnd() * kinds.length)];
      put(sr, sc, tile); secret = { kind, interaction, tile: { c:sc, r:sr }, char:tile };
    }
    // Frontier landmarks keep exploration rewarding even on a run with fewer
    // optional secrets. They are still deterministic and use the cave registry.
    let cave = null;
    if (!secret && ((col * 11 + row * 7) % 17 === 0)) {
      cave = { kind: ['gift30','fairy','hintCourage','hintWoods'][((col + row) / 2 | 0) % 4] };
      const [cr, cc] = take(); put(cr, cc, 'C');
    }
    // enemies — pool widens (harder) the farther you roam from the start
    let epool = biome === 'mountain' ? ['lynel','tektite','stalfos'] :
      biome === 'forest' ? ['moblin','goriya','octorok'] :
      biome === 'desert' ? ['leever','tektite','octorok'] :
      biome === 'lake' || biome === 'coast' ? ['zola','leever','octorok'] :
      biome === 'graveyard' ? ['stalfos','keese','lynel'] : ['octorok','tektite','leever','moblin'];
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
    const usedSlots = {};
    const decoAt = (c, r) => {
      for (let i = overlay.length - 1; i >= 0; i--) {
        const [or, oc, ch] = overlay[i].split(',');
        if (+oc === c && +or === r) return ch;
      }
      return (r === 0 || r === 10 || c === 0 || c === 15) ? 'M' : '.';
    };
    const solidAt = (c, r) => Tiles.isSolid(decoAt(c, r));
    for (let i = 0; i < nEnem && espool.length; i++) {
      const t = epool[Math.floor(rnd() * epool.length)];
      let [c, r] = espool.splice(Math.floor(rnd() * espool.length), 1)[0];
      let type = t;
      if (solidAt(c, r)) {
        for (const [sc, sr] of ENEMY_SLOTS) {
          if (!usedSlots[sc + ',' + sr] && !solidAt(sc, sr)) { c = sc; r = sr; break; }
        }
      }
      usedSlots[c + ',' + r] = true;
      enemies.push([type, variantFor(type), c, r]);
    }
    return (genCache[k] = { theme, biome, overlay, enemies, cave, secret, _gen: true });
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
    const edgeChar = (nc, nr, side) => {
      if (isRiverEdge(col,row,nc,nr) || biomeFor(col,row) === 'coast' || biomeFor(nc,nr) === 'coast') return 'W';
      return 'M';
    };
    if (has(col, row - 1) && edgeOpen(col,row,col,row-1)) { g[0][7] = '.'; g[0][8] = '.'; }
    else if (has(col,row-1)) { g[0][7] = edgeChar(col,row-1,'up'); g[0][8] = g[0][7]; }
    if (has(col, row + 1) && edgeOpen(col,row,col,row+1)) { g[10][7] = '.'; g[10][8] = '.'; }
    else if (has(col,row+1)) { g[10][7] = edgeChar(col,row+1,'down'); g[10][8] = g[10][7]; }
    if (has(col - 1, row) && edgeOpen(col,row,col-1,row)) { g[4][0] = '.'; g[5][0] = '.'; }
    else if (has(col-1,row)) { g[4][0] = edgeChar(col-1,row,'left'); g[5][0] = g[4][0]; }
    if (has(col + 1, row) && edgeOpen(col,row,col+1,row)) { g[4][15] = '.'; g[5][15] = '.'; }
    else if (has(col+1,row)) { g[4][15] = edgeChar(col+1,row,'right'); g[5][15] = g[4][15]; }
    // The outer edge is also geography: coast screens meet open water at the
    // world boundary, while mountain/grass screens retain their M cliff.
    if (biomeFor(col,row) === 'coast') {
      if (row === 13) for (let c = 0; c < COLS; c++) g[10][c] = 'W';
      if (col === 11) for (let r = 0; r < ROWS; r++) g[r][15] = 'W';
    }
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
    if (!cache[k]) cache[k] = Object.assign({}, cfg, { biome: cfg.biome || biomeFor(col,row), rows: build(col, row) });
    return cache[k];
  }

  function findStart() {
    for (const k in CFG) if (CFG[k].start) {
      const [c, r] = k.split(',').map(Number);
      return { col: c, row: r, screen: get(c, r) };
    }
    return { col: 2, row: 3, screen: get(2, 3) };
  }

  return { get, findStart, has, build, edgeOpen, biomeFor, CFG, COLS_W, ROWS_W,
    _test: { genScreen, build, edgeOpen, genCacheSize: () => Object.keys(genCache).length,
      mountainPasses: MOUNTAIN_PASSES.slice(), riverFords: RIVER_FORDS.slice(), isRiverEdge } };
})();
