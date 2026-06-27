/* dungeon.js — three dungeon levels. Rooms are 11x16 dungeon-tile grids built
   procedurally (solid border, floor interior, carved doors). Each level has an
   entrance, hub, key room, item room, and a boss room with a Triforce piece. */

const Dungeon = (() => {
  // doors: {up,down,left,right} each: 'open' | 'locked' | 'wall'
  function room(doors, overlay = [], theme = 'dungeon') {
    const g = [];
    for (let y = 0; y < 11; y++) {
      const r = [];
      for (let x = 0; x < 16; x++)
        r.push((y === 0 || y === 10 || x === 0 || x === 15) ? '#' : 'F');
      g.push(r);
    }
    const door = (t) => t === 'locked' ? 'L' : 'F';
    if (doors.up && doors.up !== 'wall')    { g[0][7] = door(doors.up); g[0][8] = door(doors.up); }
    if (doors.down && doors.down !== 'wall'){ g[10][7] = door(doors.down); g[10][8] = door(doors.down); }
    if (doors.left && doors.left !== 'wall'){ g[4][0]=door(doors.left); g[5][0]=door(doors.left); g[6][0]=door(doors.left); }
    if (doors.right && doors.right !== 'wall'){ g[4][15]=door(doors.right); g[5][15]=door(doors.right); g[6][15]=door(doors.right); }
    for (const o of overlay) { const [y, x, ch] = o.split(','); g[+y][+x] = ch; }
    return { theme, rows: g.map(r => r.join('')), doors };
  }

  // Build a standard 5-room level. `spec` supplies per-level flavour.
  function makeLevel(spec) {
    const th = spec.theme;
    const L = {
      id: spec.id, name: 'LEVEL-' + spec.id,
      entry: { col: 2, row: 2, pos: [7, 9] },
      rooms: {
        // entrance (bottom) -> exits down to overworld
        '2,2': { room: room({ up: 'open' }, ['5,3,B','5,12,B','3,7,B','3,8,B'], th),
                 enemies: spec.entranceEnemies || [], exit: { down: true } },
        // hub -> up locked to boss, sides to key/item rooms
        '2,1': { room: room({ up: 'locked', down: 'open', left: 'open', right: 'open' },
                            ['3,4,B','3,11,B','7,4,B','7,11,B'], th),
                 enemies: spec.hubEnemies },
        // key room (left)
        '1,1': { room: room({ right: 'open' }, ['3,5,B','3,10,B','7,5,B','7,10,B'], th),
                 enemies: spec.keyEnemies, item: { kind: 'key', x: 8, y: 3 } },
        // item room (right)
        '3,1': { room: room({ left: 'open' }, ['5,7,B','5,8,B'], th),
                 enemies: spec.itemEnemies, item: { kind: spec.item, x: 7, y: 5 } },
        // boss room (top)
        '2,0': { room: room({ down: 'locked' }, [], th),
                 enemies: [], boss: { variant: spec.boss, x: 11, y: 4, bossOpts: spec.bossOpts || {} },
                 triforce: { x: 7, y: 3 } },
      },
    };
    return L;
  }

  const SPECS = {
    1: { id:1, theme:'dungeon', boss:'green', item:'boomerang',
         hubEnemies:[['octorok','red',5,4],['octorok','red',10,6]],
         keyEnemies:[['octorok','blue',5,4],['moblin','brown',9,5]],
         itemEnemies:[['moblin','brown',4,4],['keese',null,11,3]] },
    2: { id:2, theme:'dungeon2', boss:'red', item:'bow',
         hubEnemies:[['stalfos',null,5,4],['keese',null,10,6],['gel',null,8,7]],
         keyEnemies:[['stalfos',null,5,4],['stalfos',null,10,5],['gel',null,8,3]],
         itemEnemies:[['moblin','blue',4,4],['keese',null,11,4],['keese',null,3,7]] },
    3: { id:3, theme:'dungeon', boss:'blue', item:'heartcontainer',
         hubEnemies:[['lynel',null,5,4],['keese',null,10,6],['stalfos',null,8,7]],
         keyEnemies:[['stalfos',null,5,4],['lynel',null,10,5],['gel',null,4,3]],
         itemEnemies:[['lynel',null,6,4],['keese',null,11,4],['gel',null,3,7]] },
    4: { id:4, theme:'dungeon2', boss:'gleeok', bossOpts:{ headHp:4 }, item:'stepladder',
         entranceEnemies:[['goriya','brown',5,5],['goriya','brown',10,5]],
         hubEnemies:[['ironknuckle',null,7,4],['goriya','brown',4,6],['darknut',null,10,5]],
         keyEnemies:[['darknut',null,5,4],['darknut',null,10,5]],
         itemEnemies:[['wizzrobe',null,6,5],['likelike',null,9,3]] },
    5: { id:5, theme:'dungeon', boss:'gleeok', bossOpts:{ headHp:6 }, item:'silverarrows',
         entranceEnemies:[['goriya','blue',5,5],['goriya','blue',10,5]],
         hubEnemies:[['wizzrobe',null,5,4],['ironknuckle',null,10,6],['likelike',null,8,7]],
         keyEnemies:[['ironknuckle',null,5,4],['darknut',null,10,5],['goriya','brown',8,3]],
         itemEnemies:[['wizzrobe',null,4,4],['wizzrobe',null,11,4]] },
    6: { id:6, theme:'dungeon2', boss:'gleeok', bossOpts:{ headHp:8, extraFireballs:1 }, item:'magickey',
         entranceEnemies:[['ironknuckle',null,5,5],['ironknuckle',null,10,5]],
         hubEnemies:[['darknut',null,5,4],['wizzrobe',null,10,6],['lynel',null,8,7]],
         keyEnemies:[['darknut',null,5,4],['darknut',null,10,5],['wizzrobe',null,8,3]],
         itemEnemies:[['goriya','brown',4,4],['ironknuckle',null,11,4]] },
    7: { id:7, theme:'dungeon', boss:'blue', item:'heartcontainer',
         entranceEnemies:[['darknut',null,5,5],['darknut',null,10,5]],
         hubEnemies:[['wizzrobe',null,5,4],['lynel',null,10,6],['ironknuckle',null,8,7]],
         keyEnemies:[['lynel',null,5,4],['darknut',null,10,5]],
         itemEnemies:[['wizzrobe',null,4,4],['ironknuckle',null,11,4]] },
    8: { id:8, theme:'dungeon2', boss:'gleeok', bossOpts:{ headHp:10, extraFireballs:2 }, item:'heartcontainer',
         entranceEnemies:[['ironknuckle',null,5,5],['ironknuckle',null,10,5]],
         hubEnemies:[['lynel',null,5,4],['darknut',null,10,6],['wizzrobe',null,8,7]],
         keyEnemies:[['ironknuckle',null,5,4],['lynel',null,10,5]],
         itemEnemies:[['darknut',null,4,4],['wizzrobe',null,11,4]] },
  };

  const cache = {};
  function level(n) {
    if (!SPECS[n]) n = 1;
    if (!cache[n]) cache[n] = makeLevel(SPECS[n]);
    return cache[n];
  }
  function getRoom(lvl, col, row) { return lvl.rooms[col + ',' + row] || null; }

  return { level, getRoom, count: Object.keys(SPECS).length };
})();
